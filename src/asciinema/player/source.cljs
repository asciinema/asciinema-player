(ns asciinema.player.source
  (:refer-clojure :exclude [js->clj])
  (:require [cljs.core.async :refer [chan >! <! put! close! timeout poll!]]
            [goog.net.XhrIo :as xhr]
            [schema.core :as s]
            [asciinema.player.format.asciicast-v0 :as v0]
            [asciinema.player.format.asciicast-v1 :as v1]
            [asciinema.player.frames :as f]
            [asciinema.vt :as vt]
            [asciinema.player.messages :as m]
            [asciinema.player.util :as util]
            [asciinema.player.patch :refer [js->clj]])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(defprotocol Source
  (init [this] "Initializes the source")
  (close [this] "Closes the source, stopping all processes and connections")
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
  (let [interval (/ 1 3)]
    (map (fn [n]
           (let [t (* interval n)]
             (f/frame t t)))
         (range))))

(defn screen-at
  "Returns screen state (lines + cursor) at given time (in seconds)."
  [seconds screen-frames]
  (last (f/frame-at seconds screen-frames)))

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
  (lazy-promise-chan
   (fn [deliver]
     (xhr/send url (fn [event]
                     (let [res (-> event .-target .getResponseText)]
                       (deliver (recording-fn res))))))))

(defn report-metadata
  "Waits for recording to load and then reports its size and duration to the
  player."
  [{:keys [recording-ch-fn]} msg-ch]
  (go
    (let [{:keys [duration width height]} (<! (@recording-ch-fn false))]
      (>! msg-ch (m/->SetMetadata width height duration))
      (>! msg-ch (m/->TriggerCanPlay)))))

(defn show-poster
  "Forces loading of recording and sends 'poster' at a given time to the
  player."
  [{:keys [recording-ch-fn]} time msg-ch]
  (go
    (let [{:keys [frames]} (<! (@recording-ch-fn true))]
      (>! msg-ch (m/->UpdateScreen (screen-at time frames))))))

(defn show-loading
  "Reports 'loading' to the player until the recording is loaded."
  [{:keys [recording-ch-fn]} msg-ch]
  (when-not (poll! (@recording-ch-fn false))
    (go
      (>! msg-ch (m/->SetLoading true))
      (<! (@recording-ch-fn false))
      (>! msg-ch (m/->SetLoading false)))))

(defn emit-coll
  "Starts sending frames as events with a given name, stopping when stop-ch
  closes."
  [coll]
  (let [out-ch (chan)]
    (go
      (let [elapsed-time (util/timer)]
        (loop [coll coll
               wall-time (elapsed-time)]
          (if-let [[time data] (first coll)]
            (let [ahead (- time wall-time)]
              (if (pos? ahead)
                (let [timeout-ch (timeout (* 1000 ahead))]
                  (<! timeout-ch)
                  (when (>! out-ch data)
                    (recur (rest coll) (elapsed-time))))
                (when (>! out-ch data)
                  (recur (rest coll) wall-time))))
            (close! out-ch)))))
    out-ch))

(defn play-frames [msg-ch frames start-at speed loop? stop-ch]
  (go
    (loop [start-at start-at
           sub-ch (emit-coll (f/frames-for-playback start-at speed frames))
           elapsed-time (util/timer speed)]
      (let [[v c] (alts! [sub-ch stop-ch])]
        (condp = c
          sub-ch (if v
                   (do
                     (>! msg-ch v)
                     (recur start-at sub-ch elapsed-time))
                   (if loop?
                     (recur 0 (emit-coll (f/frames-for-playback 0 speed frames)) (util/timer speed))
                     nil))
          stop-ch (do
                    (close! sub-ch)
                    (+ start-at (elapsed-time))))))))

(defn play!
  "Starts emitting :time and :frame events with given start position and speed.
  Stops when stop-ch closes. Returns a channel to which stop position is
  eventually delivered."
  [msg-ch frames duration start-at speed loop? stop-ch]
  (go
    (>! msg-ch (m/->SetPlaying true))
    (>! msg-ch (m/->UpdateTime start-at))
    (>! msg-ch (m/->UpdateScreen (screen-at start-at frames)))
    (let [screen-frames (f/map-frame-data m/->UpdateScreen frames)
          time-frames (f/map-frame-data m/->UpdateTime (time-frames))
          frames (f/interleave-frames screen-frames time-frames)
          stopped-at (<! (play-frames msg-ch frames start-at speed loop? stop-ch))]
      (>! msg-ch (m/->UpdateTime (or stopped-at duration)))
      (>! msg-ch (m/->SetPlaying false))
      stopped-at)))

(defn start-event-loop!
  "Main event loop of the Recording."
  [{:keys [recording-ch-fn start-at speed loop?] :as source} msg-ch]
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
                     (show-loading source msg-ch)
                     (let [{:keys [frames duration]} (<! (@recording-ch-fn true))
                           stop-ch (chan)
                           end-ch (play! msg-ch frames duration start-at speed loop? stop-ch)]
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
                               {:keys [frames duration]} (<! (@recording-ch-fn true))
                               start-at (util/adjust-to-range start-at 0 duration)]
                           (>! msg-ch (m/->UpdateTime start-at))
                           (>! msg-ch (m/->UpdateScreen (screen-at start-at frames)))
                           (recur start-at speed end-ch stop-ch)))))
    command-ch))

(defrecord Recording [url start-at speed auto-play? loop? preload? poster-time recording-fn recording-ch-fn stop-ch command-ch]
  Source
  (init [this]
    (let [msg-ch (chan)]
      (reset! command-ch (start-event-loop! this msg-ch))
      (let [f (make-recording-ch-fn url recording-fn)]
        (reset! recording-ch-fn f)
        (report-metadata this msg-ch))
      (when preload?
        (@recording-ch-fn true))
      (if auto-play?
        (start this)
        (when poster-time
          (show-poster this poster-time msg-ch)))
      msg-ch))
  (close [this]
    (stop this)
    (reset! command-ch nil))
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

(defn recording [url start-at speed auto-play? loop? preload poster-time recording-fn]
  (->Recording url start-at speed auto-play? loop? preload poster-time recording-fn (atom nil) (atom nil) (atom nil)))


(defmethod make-source :asciicast [url {:keys [start-at speed auto-play loop preload poster-time]}]
  (recording url start-at speed auto-play loop preload poster-time
                   (fn [json]
                     (-> json
                         js/JSON.parse
                         (js->clj :keywordize-keys true)
                         initialize-asciicast))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn vts! [width height msg-ch]
  (let [stdout-ch (chan)]
    (go-loop [vt (vt/make-vt width height)]
      (when-let [stdout (<! stdout-ch)]
        (let [new-vt (vt/feed-str vt stdout)]
          (>! msg-ch (m/->UpdateScreen new-vt))
          (recur new-vt))))
    stdout-ch))

(defn start-random-stdout-gen! [msg-ch stdout-ch speed stop-ch]
  (go
    (>! msg-ch (m/->SetPlaying true))
    (loop []
      (let [[v c] (alts! [stop-ch (timeout (/ (* 100 (rand)) speed))])]
        (when-not (= c stop-ch)
          (>! stdout-ch (js/String.fromCharCode (rand-int 0xa0)))
          (recur))))
    (>! msg-ch (m/->SetPlaying false))))

(defrecord JunkPrinter [speed auto-play? width height msg-ch stdout-ch stop-ch]
  Source
  (init [this]
    (reset! msg-ch (chan))
    (reset! stdout-ch (vts! width height @msg-ch))
    (when auto-play?
      (start this))
    @msg-ch)
  (close [this]
    (stop this))
  (start [this]
    (when-not @stop-ch
      (let [command-ch (chan)]
        (reset! stop-ch command-ch)
        (start-random-stdout-gen! @msg-ch @stdout-ch speed command-ch))))
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
  (->JunkPrinter speed auto-play width height (atom nil) (atom nil) (atom nil)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn es-message [payload]
  (js->clj (.parse js/JSON payload) :keywordize-keys true))

(defn process-es-messages! [es-ch msg-ch]
  (go
    (let [{:keys [time width height stdout]} (<! es-ch)
          stdout-ch (vts! width height msg-ch)]
      (>! stdout-ch stdout)
      (loop []
        (when-let [{:keys [stdout]} (<! es-ch)]
          (>! stdout-ch stdout)
          (recur))))))

(defn start-event-source! [url msg-ch]
  (let [es (js/EventSource. url)
        es-ch (atom nil)]
    (put! msg-ch (m/->SetLoading true))
    (set! (.-onopen es) (fn []
                          (let [command-ch (chan 10000 (map es-message))] ; 10000 to make enough buffer for very fast es producers
                            (reset! es-ch command-ch)
                            (process-es-messages! command-ch msg-ch)
                            (put! msg-ch (m/->SetPlaying true))
                            (put! msg-ch (m/->SetLoading false)))))
    (set! (.-onerror es) (fn [err]
                           (close! @es-ch)
                           (reset! es-ch nil)
                           (put! msg-ch (m/->SetLoading true))))
    (set! (.-onmessage es) (fn [event]
                             (when-let [command-ch @es-ch]
                               (put! command-ch (.-data event)))))))

(defrecord StreamSource [msg-ch url auto-play? started?]
  Source
  (init [this]
    (reset! msg-ch (chan))
    (when auto-play?
      (start this)))
  (close [this]
    (stop this)) ; TODO disconnect ES
  (start [this]
    (when-not @started?
      (reset! started? true)
      (start-event-source! url @msg-ch)))
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
