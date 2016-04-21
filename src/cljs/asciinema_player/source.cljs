(ns asciinema-player.source
  (:require [cljs.core.async :refer [chan >! <! put! close! timeout poll!]]
            [ajax.core :as http]
            [asciinema-player.vt :as vt]
            [asciinema-player.util :as util])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(defprotocol Source
  (init [this] "Initializes the source")
  (start [this] "Starts the playback")
  (stop [this] "Stops the playback")
  (toggle [this] "Toggles the playback on/off")
  (seek [this time] "Jumps to the given time")
  (change-speed [this speed] "Changes playback speed (1.0 is normal speed)"))

(defmulti make-source
  "Returns a Source instance for given type and args."
  (fn [type events-ch url width-hint height-hint initial-start-at initial-speed auto-play loop preload] type))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn screen-state-at
  "Returns screen state (lines + cursor) at given time (in seconds)."
  [frames seconds]
  (loop [frames frames
         seconds seconds
         candidate nil]
    (let [[delay screen-state :as frame] (first frames)]
      (if (or (nil? frame) (< seconds delay))
        candidate
        (recur (rest frames) (- seconds delay) screen-state)))))

(defn drop-frames
  "Returns sequence of frames starting at given time (in seconds)."
  [frames seconds]
  (if (seq frames)
    (let [[delay screen-state] (first frames)]
      (if (< delay seconds)
        (recur (rest frames) (- seconds delay))
        (cons [(- delay seconds) screen-state] (rest frames))))
    frames))

(defn- fix-line-diff-keys [line-diff]
  (into {} (map (fn [[k v]] [(js/parseInt (name k) 10) v]) line-diff)))

(defn fix-diffs
  "Converts integer keys referring to line numbers in line diff (which are
  keywords) to actual integers."
  [frames]
  (map #(update-in % [1 :lines] fix-line-diff-keys) frames))

(defn reduce-v0-frame [[_ acc] [delay diff]]
  [delay (merge-with merge acc diff)])

(defn build-v0-frames [diffs]
  (let [diffs (fix-diffs diffs)
        acc {:lines (sorted-map)
             :cursor {:x 0 :y 0 :visible true}}]
    (reductions reduce-v0-frame [0 acc] diffs)))

(defn acc->frame
  "Extracts lines and cursor from pre v1 format frame."
  [acc]
  (update-in acc [:lines] vals))

(defn reduce-v1-frame [[_ vt] [delay str]]
  [delay (vt/feed-str vt str)])

(defn build-v1-frames [{:keys [stdout width height]}]
  (let [vt (vt/make-vt width height)]
    (reductions reduce-v1-frame [0 vt] stdout)))

(defn vt->frame
  "Extracts lines and cursor from given vt, converting unicode codepoints to
  strings."
  [{:keys [lines cursor]}]
  {:lines (vt/compact-lines lines)
   :cursor cursor})

(defmulti initialize-asciicast
  "Given fetched asciicast extracts width, frame and frames into a map."
  (fn [asciicast]
    (if (vector? asciicast)
      0
      (:version asciicast))))

(defmethod initialize-asciicast 0 [asciicast]
  (let [frame-0-lines (-> asciicast first last :lines)
        asciicast-width (->> frame-0-lines vals first (map #(count (first %))) (reduce +))
        asciicast-height (count frame-0-lines)]
    {:width asciicast-width
     :height asciicast-height
     :frame-fn #(delay (acc->frame %))
     :duration (reduce #(+ %1 (first %2)) 0 asciicast)
     :frames (build-v0-frames asciicast)}))

(defmethod initialize-asciicast 1 [asciicast]
  {:width (:width asciicast)
   :height (:height asciicast)
   :frame-fn #(delay (vt->frame %))
   :duration (reduce #(+ %1 (first %2)) 0 (:stdout asciicast))
   :frames (build-v1-frames asciicast)})

(defmethod initialize-asciicast :default [player asciicast]
  (throw (str "unsupported asciicast version: " (:version asciicast))))

(defn time-frames
  "Returns in infinite seq of time frames at given speed, starting from start-at
  (in sec)."
  [start-at elapsed-time]
  (repeatedly (fn [] [0.3 (+ start-at (elapsed-time))])))

(defn frames-at-speed [frames speed]
  (map (fn [[delay data]] [(/ delay speed) data]) frames))

(defn lazy-promise-chan
  "Returns a function f returning a promise channel. The calculation of the
  promise value is triggered by calling f with truthy value."
  ;; TODO simplify it with async/promise-chan when it gets fixed (http://dev.clojure.org/jira/browse/ASYNC-159)
  [f]
  (let [force-ch (chan)
        ready-chan (chan)
        value (atom nil)]
    (go
      (<! force-ch)
      (f (fn [v]
           (reset! value v)
           (close! ready-chan))))
    (fn [force?]
      (when force?
        (close! force-ch))
      (let [value-ch (chan)]
        (go
          (<! ready-chan)
          (>! value-ch @value))
        value-ch))))

(defn make-recording-ch-fn [url recording-fn]
  (lazy-promise-chan (fn [deliver]
                       (http/GET url
                           {:response-format :raw
                            :handler #(deliver (recording-fn %))
                            :error-handler #(println %)}))))

(defn report-duration-and-size
  "Waits for recording to load and then reports its size and duration to the
  player."
  [{:keys [events-ch recording-ch-fn]}]
  (go
    (let [{:keys [duration width height]} (<! (@recording-ch-fn false))]
      (>! events-ch [:duration duration])
      (>! events-ch [:size width height]))))

(defn show-loading
  "Reports 'loading' to the player until the recording is loaded."
  [{:keys [events-ch recording-ch-fn]}]
  (when-not (poll! (@recording-ch-fn false))
    (go
      (>! events-ch [:loading true])
      (<! (@recording-ch-fn false))
      (>! events-ch [:loading false]))))

(defn emit-events
  "Starts sending frames as events with a given name, stopping when stop-ch
  closes."
  [event-name coll f events-ch stop-ch]
  (let [elapsed-time (util/timer)]
    (go
      (loop [coll coll
             virtual-time 0
             wall-time (elapsed-time)]
        (if-let [[delay data] (first coll)]
          (let [new-virtual-time (+ virtual-time delay)
                ahead (- new-virtual-time wall-time)]
            (if (pos? ahead)
              (let [timeout-ch (timeout (* 1000 ahead))
                    [_ c] (alts! [stop-ch timeout-ch] :priority true)]
                (when (= c timeout-ch)
                  (do
                    (>! events-ch [event-name (f data)])
                    (recur (rest coll) new-virtual-time (elapsed-time)))))
              (do
                (>! events-ch [event-name (f data)])
                (recur (rest coll) new-virtual-time wall-time)))))))))

(defn play!
  "Starts emitting :time and :frame events with given start position and speed.
  Stops when stop-ch closes. Returns a channel to which stop position is
  eventually delivered."
  [events-ch frames frame-fn duration stop-ch start-at speed loop?]
  (go
    (>! events-ch [:playing true])
    (loop [start-at start-at]
      (let [elapsed-time (util/timer speed)
            vfs (-> frames (drop-frames start-at) (frames-at-speed speed))
            tfs (time-frames start-at elapsed-time)
            local-stop-ch (chan)
            done-ch (emit-events :frame vfs frame-fn events-ch local-stop-ch)
            _ (emit-events :time tfs identity events-ch local-stop-ch)
            [_ c] (alts! [done-ch stop-ch])]
        (close! local-stop-ch)
        (if (= c done-ch)
          (if loop?
            (recur 0)
            (do
              (>! events-ch [:time duration])
              (>! events-ch [:playing false])
              0))
          (do
            (>! events-ch [:playing false])
            (+ start-at (elapsed-time))))))))

(defn start-event-loop!
  "Main event loop of the PrerecordedSource."
  [{:keys [events-ch recording-ch-fn start-at speed loop?] :as source}]
  (let [command-ch (chan 10)
        pri-ch (chan 10)]
    (go-loop [start-at start-at
              speed speed
              end-ch nil
              stop-ch nil]
      (let [ports (remove nil? [pri-ch command-ch end-ch])
            [v c] (alts! ports :priority true)
            [command arg] (if (= c end-ch) [:internal/rewind v] v)]
        (condp = command
          :start (if stop-ch
                   (recur start-at speed end-ch stop-ch)
                   (do
                     (show-loading source)
                     (let [{:keys [frames frame-fn duration]} (<! (@recording-ch-fn true))
                           stop-ch (chan)
                           end-ch (play! events-ch frames frame-fn duration stop-ch start-at speed loop?)]
                       (recur nil speed end-ch stop-ch))))
          :stop (if stop-ch
                  (do
                    (close! stop-ch)
                    (recur (<! end-ch) speed nil nil))
                  (recur start-at speed end-ch stop-ch))
          :toggle (let [command (if stop-ch :stop :start)]
                    (>! pri-ch [command])
                    (recur start-at speed end-ch stop-ch))
          :seek (let [new-start-at arg]
                  (when stop-ch
                    (>! pri-ch [:stop]))
                  (>! pri-ch [:internal/seek new-start-at])
                  (when stop-ch
                    (>! pri-ch [:start]))
                  (recur start-at speed end-ch stop-ch))
          :change-speed (let [new-speed arg]
                          (when stop-ch
                            (>! pri-ch [:stop])
                            (>! pri-ch [:start]))
                          (recur start-at new-speed end-ch stop-ch))
          :internal/rewind (recur 0 speed nil nil)
          :internal/seek (let [start-at arg
                               {:keys [frames frame-fn]} (<! (@recording-ch-fn true))]
                           (>! events-ch [:time start-at])
                           (>! events-ch [:frame (frame-fn (screen-state-at frames start-at))])
                           (recur start-at speed end-ch stop-ch)))))
    command-ch))

(defrecord PrerecordedSource [events-ch url start-at speed auto-play? loop? preload? recording-fn recording-ch-fn stop-ch command-ch]
  Source
  (init [this]
    (reset! command-ch (start-event-loop! this))
    (let [f (make-recording-ch-fn url recording-fn)]
      (reset! recording-ch-fn f)
      (report-duration-and-size this))
    (when preload?
      (@recording-ch-fn true))
    (when auto-play?
      (start this)))
  (start [this]
    (put! @command-ch [:start]))
  (stop [this]
    (put! @command-ch [:stop]))
  (toggle [this]
    (put! @command-ch [:toggle]))
  (seek [this time]
    (put! @command-ch [:seek time]))
  (change-speed [this speed]
    (put! @command-ch [:change-speed speed])))

(defn prerecorded-source [events-ch url initial-start-at initial-speed auto-play? loop? preload recording-fn]
  (->PrerecordedSource events-ch url initial-start-at initial-speed auto-play? loop? preload recording-fn (atom nil) (atom nil) (atom nil)))

(defmethod make-source :asciicast [type events-ch url width-hint height-hint initial-start-at initial-speed auto-play? loop? preload?]
  (prerecorded-source events-ch url initial-start-at initial-speed auto-play? loop? preload?
                      (fn [json]
                        (-> json
                            js/JSON.parse
                            (util/faster-js->clj :keywordize-keys true)
                            initialize-asciicast))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn vts! [width height events-ch]
  (let [stdout-ch (chan)]
    (go-loop [vt (vt/make-vt width height)]
      (when-let [stdout (<! stdout-ch)]
        (let [new-vt (vt/feed-str vt stdout)]
          (>! events-ch [:frame (delay (vt->frame new-vt))])
          (recur new-vt))))
    stdout-ch))

(defn start-random-stdout-gen! [events-ch stdout-ch speed stop-ch]
  (go
    (>! events-ch [:playing true])
    (loop []
      (let [[v c] (alts! [stop-ch (timeout (/ (* 100 (rand)) speed))])]
        (when-not (= c stop-ch)
          (>! stdout-ch (js/String.fromCharCode (rand-int 0xa0)))
          (recur))))
    (>! events-ch [:playing false])))

(defrecord RandomSource [events-ch speed auto-play? width height stdout-ch stop-ch]
  Source
  (init [this]
    (reset! stdout-ch (vts! width height events-ch))
    (when auto-play?
      (start this)))
  (start [this]
    (when-not @stop-ch
      (let [command-ch (chan)]
        (reset! stop-ch command-ch)
        (start-random-stdout-gen! events-ch @stdout-ch speed command-ch))))
  (stop [this]
    (when @stop-ch
      (close! @stop-ch)
      (reset! stop-ch nil)))
  (toggle [this]
    (if @stop-ch
      (stop this)
      (start this)))
  (seek [this position]
    nil)
  (change-speed [this speed]
    nil))

(defmethod make-source :random [type events-ch url width-hint height-hint initial-start-at initial-speed auto-play? loop? preload?]
  (->RandomSource events-ch initial-speed auto-play? width-hint height-hint (atom nil) (atom nil)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn es-message [payload]
  (util/faster-js->clj (.parse js/JSON payload) :keywordize-keys true))

(defn process-es-messages! [es-ch events-ch]
  (go
    (let [{:keys [time width height stdout]} (<! es-ch)
          stdout-ch (vts! width height events-ch)]
      (>! stdout-ch stdout)
      (loop []
        (when-let [{:keys [stdout]} (<! es-ch)]
          (>! stdout-ch stdout)
          (recur))))))

(defn start-event-source! [url events-ch]
  (let [es (js/EventSource. url)
        es-ch (atom nil)]
    (put! events-ch [:loading true])
    (set! (.-onopen es) (fn []
                          (let [command-ch (chan 10000 (map es-message))] ; 10000 to make enough buffer for very fast es producers
                            (reset! es-ch command-ch)
                            (process-es-messages! command-ch events-ch)
                            (put! events-ch [:playing true])
                            (put! events-ch [:loading false]))))
    (set! (.-onerror es) (fn [err]
                           (close! @es-ch)
                           (reset! es-ch nil)
                           (put! events-ch [:loading true])))
    (set! (.-onmessage es) (fn [event]
                             (when-let [command-ch @es-ch]
                               (put! command-ch (.-data event)))))))

(defrecord StreamSource [events-ch url auto-play? started?]
  Source
  (init [this]
    (when auto-play?
      (start this)))
  (start [this]
    (when-not @started?
      (reset! started? true)
      (start-event-source! url events-ch)))
  (stop [this]
    nil)
  (toggle [this]
    (start this))
  (seek [this position]
    nil)
  (change-speed [this speed]
    nil))

(defmethod make-source :stream [type events-ch url width-hint height-hint initial-start-at initial-speed auto-play? loop? preload?]
  (->StreamSource events-ch url auto-play? (atom false)))
