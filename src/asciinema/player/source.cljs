(ns asciinema.player.source
  (:refer-clojure :exclude [js->clj])
  (:require [cljs.core.async :refer [chan >! <! put! close! timeout poll!]]
            [ajax.core :as http]
            [schema.core :as s]
            [asciinema.player.format.asciicast-v0 :as v0]
            [asciinema.player.format.asciicast-v1 :as v1]
            [asciinema.player.vt :as vt]
            [asciinema.player.util :as util]
            [asciinema.player.patch :refer [js->clj]])
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
  (fn [url {:keys [type]}]
    (or type :asciicast)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn screen-state-at
  "Returns screen state (lines + cursor) at given time (in seconds)."
  [screen-frames seconds]
  (last (last (take-while #(<= (first %) seconds) screen-frames))))

(defn drop-frames
  "Returns sequence of frames starting at given time (in seconds)."
  [frames seconds]
  (drop-while #(< (first %) seconds) frames))

(defmulti initialize-asciicast
  "Given fetched asciicast extracts width, height and frames into a map."
  (fn [asciicast]
    (if (vector? asciicast)
      0
      (:version asciicast))))

(defmethod initialize-asciicast 0 [asciicast]
  (v0/initialize-asciicast asciicast))

(defmethod initialize-asciicast 1 [asciicast]
  (v1/initialize-asciicast asciicast))

(defmethod initialize-asciicast :default [asciicast]
  (throw (str "unsupported asciicast version: " (:version asciicast))))

(defn time-frames
  "Returns infinite seq of time frames."
  []
  (iterate (fn [[a b]]
             [(inc a) (inc b)])
           [0 0]))

(defn frames-at-speed
  "Alters time of each frame to match given speed."
  [frames speed]
  (map (fn [[time data]]
         (vector (/ time speed) data))
       frames))

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
  [{:keys [recording-ch-fn]} events-ch]
  (go
    (let [{:keys [duration width height]} (<! (@recording-ch-fn false))]
      (>! events-ch [:duration duration])
      (>! events-ch [:size width height]))))

(defn show-poster
  "Forces loading of recording and sends 'poster' at a given time to the
  player."
  [{:keys [recording-ch-fn]} time events-ch]
  (go
    (let [{:keys [frames]} (<! (@recording-ch-fn true))]
      (>! events-ch [:screen (screen-state-at frames time)]))))

(defn show-loading
  "Reports 'loading' to the player until the recording is loaded."
  [{:keys [recording-ch-fn]} events-ch]
  (when-not (poll! (@recording-ch-fn false))
    (go
      (>! events-ch [:loading true])
      (<! (@recording-ch-fn false))
      (>! events-ch [:loading false]))))

(defn emit-events
  "Starts sending frames as events with a given name, stopping when stop-ch
  closes."
  [event-name coll start-at events-ch stop-ch]
  (let [elapsed-time (util/timer)]
    (go
      (loop [coll coll
             wall-time (elapsed-time)]
        (if-let [[time data] (first coll)]
          (let [ahead (- time start-at wall-time)]
            (if (pos? ahead)
              (let [timeout-ch (timeout (* 1000 ahead))
                    [_ c] (alts! [stop-ch timeout-ch] :priority true)]
                (when (= c timeout-ch)
                  (do
                    (>! events-ch [event-name data])
                    (recur (rest coll) (elapsed-time)))))
              (do
                (>! events-ch [event-name data])
                (recur (rest coll) wall-time)))))))))

(defn play!
  "Starts emitting :time and :frame events with given start position and speed.
  Stops when stop-ch closes. Returns a channel to which stop position is
  eventually delivered."
  [events-ch frames duration stop-ch start-at speed loop?]
  (go
    (>! events-ch [:playing true])
    (loop [start-at start-at]
      (let [elapsed-time (util/timer speed)
            sfs (-> frames (drop-frames start-at) (frames-at-speed speed))
            tfs (-> (time-frames) (drop-frames start-at) (frames-at-speed speed))
            local-stop-ch (chan)
            done-ch (emit-events :screen sfs (/ start-at speed) events-ch local-stop-ch)
            _ (emit-events :time tfs (/ start-at speed) events-ch local-stop-ch)
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
  [{:keys [recording-ch-fn start-at speed loop?] :as source} events-ch]
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
                     (show-loading source events-ch)
                     (let [{:keys [frames duration]} (<! (@recording-ch-fn true))
                           stop-ch (chan)
                           end-ch (play! events-ch frames duration stop-ch start-at speed loop?)]
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
                               {:keys [frames]} (<! (@recording-ch-fn true))]
                           (>! events-ch [:time start-at])
                           (>! events-ch [:screen (screen-state-at frames start-at)])
                           (recur start-at speed end-ch stop-ch)))))
    command-ch))

(defrecord PrerecordedSource [url start-at speed auto-play? loop? preload? poster-time recording-fn recording-ch-fn stop-ch command-ch]
  Source
  (init [this]
    (let [events-ch (chan)]
      (reset! command-ch (start-event-loop! this events-ch))
      (let [f (make-recording-ch-fn url recording-fn)]
        (reset! recording-ch-fn f)
        (report-duration-and-size this events-ch))
      (when preload?
        (@recording-ch-fn true))
      (if auto-play?
        (start this)
        (when poster-time
          (show-poster this poster-time events-ch)))
      events-ch))
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

(defn prerecorded-source [url start-at speed auto-play? loop? preload poster-time recording-fn]
  (->PrerecordedSource url start-at speed auto-play? loop? preload poster-time recording-fn (atom nil) (atom nil) (atom nil)))

(defmethod make-source :asciicast [url {:keys [start-at speed auto-play loop preload poster-time]}]
  (prerecorded-source url start-at speed auto-play loop preload poster-time
                      (fn [json]
                        (-> json
                            js/JSON.parse
                            (js->clj :keywordize-keys true)
                            initialize-asciicast))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn vts! [width height events-ch]
  (let [stdout-ch (chan)]
    (go-loop [vt (vt/make-vt width height)]
      (when-let [stdout (<! stdout-ch)]
        (let [new-vt (vt/feed-str vt stdout)]
          (>! events-ch [:screen new-vt])
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

(defrecord RandomSource [speed auto-play? width height events-ch stdout-ch stop-ch]
  Source
  (init [this]
    (reset! events-ch (chan))
    (reset! stdout-ch (vts! width height @events-ch))
    (when auto-play?
      (start this))
    @events-ch)
  (start [this]
    (when-not @stop-ch
      (let [command-ch (chan)]
        (reset! stop-ch command-ch)
        (start-random-stdout-gen! @events-ch @stdout-ch speed command-ch))))
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

(defmethod make-source :random [_ {:keys [url width height speed auto-play]}]
  (->RandomSource speed auto-play width height (atom nil) (atom nil) (atom nil)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn es-message [payload]
  (js->clj (.parse js/JSON payload) :keywordize-keys true))

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
    (reset! events-ch (chan))
    (when auto-play?
      (start this)))
  (start [this]
    (when-not @started?
      (reset! started? true)
      (start-event-source! url @events-ch)))
  (stop [this]
    nil)
  (toggle [this]
    (start this))
  (seek [this position]
    nil)
  (change-speed [this speed]
    nil))

(defmethod make-source :stream [url {:keys [auto-play]}]
  (->StreamSource (atom nil) url auto-play (atom false)))
