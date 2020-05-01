(ns asciinema.player.source
  (:refer-clojure :exclude [js->clj])
  (:require [cljs.core.async :refer [chan >! <! put! close! timeout poll! promise-chan]]
            [goog.net.XhrIo :as xhr]
            [asciinema.player.asciicast :as asciicast]
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
  "Returns a function returning a promise channel. The calculation of the
  promise value is triggered by calling returned function with truthy value."
  [f]
  (let [force-ch (chan)
        value-ch (promise-chan)]
    (go
      (<! force-ch)
      (f (fn [v]
           (put! value-ch v))))
    (fn [force?]
      (when force?
        (close! force-ch))
      value-ch)))

(defn make-recording-ch-fn [thing vt-width vt-height idle-time-limit]
  (lazy-promise-chan
   (fn [deliver]
     (if (string? thing)
       (xhr/send thing (fn [event]
                         (let [str (-> event .-target .getResponseText)]
                           (deliver (asciicast/load str vt-width vt-height idle-time-limit)))))
       (deliver (asciicast/load thing vt-width vt-height idle-time-limit))))))

(defn report-metadata
  "Reports recording dimensions and duration to the player."
  [{:keys [width height duration]} msg-ch]
  (put! msg-ch (m/->SetMetadata width height duration))
  (put! msg-ch (m/->TriggerCanPlay)))

(defn show-poster
  "Sends 'poster' at a given time to the player."
  [{:keys [frames]} time msg-ch]
  (put! msg-ch (m/->UpdateScreen (screen-at time frames))))

(defn emit-coll
  "Starts sending frames as events with a given name, stopping when out-ch
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
                    (do
                      (>! msg-ch (m/->TriggerEnded))
                      (when loop?
                        (recur 0 (emit-coll (f/frames-for-playback 0 speed frames)) (util/timer speed)))))
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

(defn start-event-loop
  "Main event loop of the Recording."
  [{:keys [start-at speed loop? command-ch]} msg-ch data]
  (let [pri-ch (chan 10)]
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
                   (let [{:keys [frames duration]} data
                         stop-ch (chan)
                         end-ch (play! msg-ch frames duration start-at speed loop? stop-ch)]
                     (recur nil speed end-ch stop-ch)))
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
          :exit nil
          :internal/rewind (recur 0 speed nil nil)
          :internal/seek (let [start-at arg
                               {:keys [frames duration]} data
                               start-at (util/adjust-to-range start-at 0 duration)]
                           (>! msg-ch (m/->UpdateTime start-at))
                           (>! msg-ch (m/->UpdateScreen (screen-at start-at frames)))
                           (recur start-at speed end-ch stop-ch)))))))

(defn dorun-when-idle [coll]
  (when-let [ric (util/window-prop "requestIdleCallback")]
    (letfn [(make-cb [coll]
              (fn []
                (when (seq coll)
                  (ric (make-cb (rest coll))))))]
      (ric (make-cb coll)))))

(defn start-preloader [{:keys [recording-ch-fn command-ch force-load-ch preload? poster-time] :as recording} msg-ch]
  (go
    (let [recording-ch (recording-ch-fn (or preload? poster-time))
          [v c] (alts! [recording-ch force-load-ch])
          data (condp = c
                 recording-ch v
                 force-load-ch (do
                                 (>! msg-ch (m/->SetLoading true))
                                 (let [data (<! (recording-ch-fn true))]
                                   (>! msg-ch (m/->SetLoading false))
                                   data)))]
      (when poster-time
        (show-poster data poster-time msg-ch))
      (report-metadata data msg-ch)
      (start-event-loop recording msg-ch data)
      (dorun-when-idle (:frames data)))))

(defrecord Recording [recording-ch-fn command-ch force-load-ch start-at speed auto-play? loop? preload? poster-time]
  Source
  (init [this]
    (let [msg-ch (chan)]
      (start-preloader this msg-ch)
      (when auto-play?
        (start this))
      msg-ch))
  (close [this]
    (put! command-ch [:stop])
    (put! command-ch [:exit]))
  (start [this]
    (close! force-load-ch)
    (put! command-ch [:start]))
  (stop [this]
    (put! command-ch [:stop]))
  (toggle [this]
    (close! force-load-ch)
    (put! command-ch [:toggle]))
  (seek [this time]
    (close! force-load-ch)
    (put! command-ch [:seek time]))
  (change-speed [this speed]
    (put! command-ch [:change-speed speed])))

(defmethod make-source :asciicast [url {:keys [width height start-at speed idle-time-limit auto-play loop preload poster-time]}]
  (let [recording-ch-fn (make-recording-ch-fn url width height idle-time-limit)
        command-ch (chan 10)
        force-load-ch (chan)]
    (->Recording recording-ch-fn
                 command-ch
                 force-load-ch
                 start-at
                 speed
                 auto-play
                 loop
                 preload
                 poster-time)))

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

(defrecord Stream [msg-ch url auto-play? started?]
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
  (->Stream (atom nil) url auto-play (atom false)))
