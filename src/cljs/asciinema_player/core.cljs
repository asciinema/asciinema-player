(ns asciinema-player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema-player.view :as view]
            [asciinema-player.util :as util]
            [asciinema-player.vt :as vt]
            [cljs.core.async :refer [chan >! <! put! timeout close! dropping-buffer sliding-buffer]]
            [clojure.walk :as walk]
            [clojure.set :refer [rename-keys]]
            [ajax.core :refer [GET]]
            [clojure.string :as str])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(defn parse-npt [t]
  (if (number? t)
    t
    (let [numbers (map js/parseFloat (str/split t #":"))
          components (map * (reverse numbers) (iterate (partial * 60) 1))]
      (apply + components))))

(defn parse-json-poster [poster]
  (-> poster
      (.replace (js/RegExp. "\\s" "g") "")
      js/atob
      js/JSON.parse
      (js->clj :keywordize-keys true)))

(defn parse-text-poster [text width height]
  (-> (vt/make-vt width height)
      (vt/feed-str text)
      :lines
      vt/compact-lines))

(defn parse-poster [poster width height]
  (if (string? poster)
    (condp #(= (.indexOf %2 %1) 0) poster
      "data:application/json;base64," (-> poster (.substring 29) parse-json-poster)
      "data:text/plain," (-> poster (.substring 16) (parse-text-poster width height))
      nil)
    poster))

(defn make-player
  "Builds initial player for given options."
  [asciicast-url {:keys [width height speed poster font-size theme start-at]
                  :or {speed 1 font-size "small" theme "asciinema"}
                  :as options}]
  (let [start-at (parse-npt (or start-at 0))]
    (merge {:width width
            :height height
            :duration 0
            :source {}
            :asciicast-url asciicast-url
            :speed speed
            :lines (or (parse-poster poster (or width 80) (or height 24)) [])
            :font-size font-size
            :theme theme
            :cursor {:visible false}
            :start-at start-at
            :current-time start-at
            :show-hud false}
           (select-keys options [:loop :auto-play :title :author :author-url :author-img-url]))))

(defn make-player-ratom
  "Returns Reagent atom with initial player state."
  [& args]
  (atom (apply make-player args)))

(defn dispatch [player event]
  (put! (:event-ch player) event))

(defn show-spinner [player]
  (assoc player :loading true))

(defn hide-spinner [player]
  (assoc player :loading false))

(defn elapsed-time-since
  "Returns wall time (in seconds) elapsed since then."
  [then]
  (/ (- (.getTime (js/Date.)) (.getTime then)) 1000))

(defn update-screen
  "Extracts screen state (line content and cursor attributes) from given frame
  payload and applies it to player."
  [{:keys [frame-fn] :as player} frame]
  (let [{:keys [lines cursor]} (frame-fn frame)]
    (-> player
        (assoc :lines lines)
        (update-in [:cursor] merge cursor))))

(defn coll->chan
  "Returns a channel that emits elements from the given collection. The
  difference from core.async/to-chan is this function expects elements of the
  collection to be tuples of [delay data], and it emits data after delay (sec)
  for each element. It tries to always stay 'on the schedule' by measuring
  elapsed time and skipping elements if necessary."
  [coll]
  (let [ch (chan)
        start (js/Date.)]
    (go
      (loop [coll coll
             virtual-time 0
             wall-time (elapsed-time-since start)]
        (if-let [[delay data] (first coll)]
          (let [new-virtual-time (+ virtual-time delay)
                ahead (- new-virtual-time wall-time)]
            (if (pos? ahead)
              (do
                (<! (timeout (* 1000 ahead)))
                (>! ch data)
                (recur (rest coll) new-virtual-time (elapsed-time-since start)))
              (do
                (>! ch data)
                (recur (rest coll) new-virtual-time wall-time))))))
      (close! ch))
    ch))

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

(defn next-frames* [frames seconds]
  (if (seq frames)
    (let [[delay screen-state] (first frames)]
      (if (<= delay seconds)
        (recur (rest frames) (- seconds delay))
        (cons [(- delay seconds) screen-state] (rest frames))))
    frames))

(defn next-frames
  "Returns a lazy sequence of frames starting from given time (in seconds)."
  [frames seconds]
  (lazy-seq (next-frames* frames seconds)))

(defn reset-blink
  "Makes cursor 'block' visible."
  [player]
  (assoc-in player [:cursor :on] true))

(defn make-cursor-blink-chan
  "Returns a channel emitting true/false/true/false/... in 0.5 sec periods."
  []
  (coll->chan (cycle [[0.5 false] [0.5 true]])))

(defn frames-at-speed [frames speed]
  (map (fn [[delay screen-state]] [(/ delay speed) screen-state]) frames))

(defn source-type
  "Returns type of the frames source (:recorded or :stream). Expects first
  argument to be player, the rest is ignored. Used mostly as multimethod
  dispatch function."
  [player & _]
  (-> player :source :type))

(defn priority-chan
  "Given primary channel and a function f returning secondary channel, returns a
  new channel that emits values from both primary and secondary channel. Every
  time there is a take from primary channel the current secondary channel is
  discarded and the new one is obtained by calling f. The resulting channel is
  closed when either input channel closes."
  [[primary-label primary-ch] [secondary-label secondary-fn]]
  (let [output-ch (chan)]
    (go-loop [secondary-ch (secondary-fn)]
      (let [[v c] (alts! [primary-ch secondary-ch])]
        (if-not (nil? v)
          (condp = c
            primary-ch (do (>! output-ch [primary-label v]) (recur (secondary-fn)))
            secondary-ch (do (>! output-ch [secondary-label v]) (recur secondary-ch)))
          (close! output-ch))))
    output-ch))

(defn screen-events
  "Given frames channel returns a channel of player events (as used with
  `dispatch`). The resulting channel produces screen update events (:frame)
  intermixed with cursor blinking events (:blink)."
  [frames-ch]
  (priority-chan [:frame frames-ch] [:blink make-cursor-blink-chan]))

(defn pipe
  "Copies elements received on input-ch to output-ch until stop-ch closes."
  [input-ch stop-ch]
  (let [output-ch (chan (sliding-buffer 1))]
    (go-loop []
      (let [[v c] (alts! [input-ch stop-ch])]
        (condp = c
          input-ch (if v
                     (do
                       (>! output-ch v)
                       (recur))
                     (close! output-ch))
          stop-ch nil)))
    output-ch))

(defmulti start-playback
  "The heart of the player. Coordinates dispatching of state update events like
  terminal line updating, time reporting and cursor blinking. Returns player
  with its :source updated (depending on the impl)."
  source-type)

(defmethod start-playback :recorded [player]
  (let [start (js/Date.)
        start-at (:start-at player)
        speed (:speed player)
        all-frames (-> player :source :frames)
        frames (-> all-frames (next-frames start-at) (frames-at-speed speed))
        stop-playback-ch (chan)
        frames-ch (pipe (coll->chan frames) stop-playback-ch)
        events-ch (screen-events frames-ch)
        elapsed-time #(* (elapsed-time-since start) speed)
        time-events (repeatedly (fn [] [0.3 (+ start-at (elapsed-time))]))
        timer-ch (pipe (coll->chan time-events) stop-playback-ch)
        stop-fn (fn []
                  (close! stop-playback-ch)
                  (elapsed-time))]
    (go
      (loop []
        (let [[v c] (alts! [events-ch timer-ch stop-playback-ch])]
          (condp = c
            timer-ch (do
                       (dispatch player [:time v])
                       (recur))
            events-ch (if v
                        (do
                          (dispatch player v)
                          (recur))
                        (dispatch player [:finished]))
            stop-playback-ch nil))) ; do nothing, break the loop
      (close! stop-playback-ch)
      (dispatch player [:blink true]))
    (-> player
        (update-screen (screen-state-at all-frames start-at))
        (assoc-in [:source :stop] stop-fn))))

(defmethod start-playback :stream [{{:keys [url width height]} :source :as player}]
  (let [es (js/EventSource. url)
        es-ch (chan 10000) ; make enough buffer for very fast ES producers
        vt-ch (chan (sliding-buffer 1))
        events-ch (screen-events vt-ch)]
    (set! (.-onopen es) (fn []
                          (dispatch player [:stream-connected])))
    (set! (.-onerror es) (fn [err]
                           (close! es-ch)
                           (dispatch player [:stream-disconnected err])))
    (set! (.-onmessage es) (fn [e]
                             (put! es-ch (.-data e))))
    (go-loop [vt (vt/make-vt width height)]
      (if-let [v (<! es-ch)]
        (let [message (js->clj (.parse js/JSON v))
              stdout (get message "stdout")
              new-vt (vt/feed-str vt stdout)]
          (>! vt-ch new-vt)
          (recur new-vt))
        (close! vt-ch)))
    (go-loop []
      (when-let [v (<! events-ch)]
        (dispatch player v)
        (recur)))
    (assoc-in player [:source :event-source] es)))

(defmulti stop-playback
  "Stops the playback and returns updated player."
  source-type)

(defmethod stop-playback :recorded [player]
  (let [t ((-> player :source :stop))]
    (-> player
        (update-in [:source] dissoc :stop)
        (update-in [:start-at] + t))))

(defmethod stop-playback :stream [player]
  player) ; we don't support this operation on stream atm

(defn fetch-asciicast
  "Fetches asciicast JSON file, setting :loading to true at the start,
  dispatching :asciicast-response event on success, :bad-response event on
  failure."
  [player]
  (let [url (:asciicast-url player)]
    (GET url
         {:response-format :raw
          :handler #(dispatch player [:asciicast-response %])
          :error-handler #(dispatch player [:bad-response %])})
    (show-spinner player)))

(defn asciicast-loaded?
  "Returns truthy value indicating whether asciicast is loaded."
  [player]
  (get-in player [:source :type]))

(defmulti playing?
  "Returns truthy value indicating whether player is playing."
  source-type)

(defmethod playing? :recorded [player]
  (get-in player [:source :stop]))

(defmethod playing? :stream [player]
  (get-in player [:source :event-source]))

(defn handle-toggle-play
  "Toggles the playback. Fetches asciicast if it wasn't loaded yet."
  [player]
  (if-not (asciicast-loaded? player)
    (fetch-asciicast player)
    (if (playing? player)
      (stop-playback player)
      (start-playback player))))

(defmulti handle-seek
  "Jumps to a given position (in seconds)."
  source-type)

(defmethod handle-seek :recorded [player [position]]
  (let [new-time (* position (:duration player))
        frames (-> player :source :frames)
        screen-state (screen-state-at frames new-time)
        was-playing? (playing? player)]
    (when was-playing?
      ((-> player :source :stop)))
    (let [new-player (-> player
                         (assoc :current-time new-time :start-at new-time)
                         (update-screen screen-state))]
      (if was-playing?
        (start-playback new-player)
        new-player))))

(defmethod handle-seek :stream [player & _]
  player) ; we don't support this operation on stream atm

(defmulti handle-rewind
  "Rewinds the playback by 5 seconds."
  source-type)

(defn new-position
  "Returns time adjusted by given offset, clipped to the range 0..total-time."
  [current-time total-time offset]
  (/ (util/adjust-to-range (+ current-time offset) 0 total-time) total-time))

(defmethod handle-rewind :recorded [player]
  (let [position (new-position (:current-time player) (:duration player) -5)]
    (handle-seek player [position])))

(defmethod handle-rewind :stream [player]
  player) ; we don't support this operation on stream atm

(defmulti handle-fast-forward
  "Fast-forwards the playback by 5 seconds."
  source-type)

(defmethod handle-fast-forward :recorded [player]
  (let [position (new-position (:current-time player) (:duration player) 5)]
    (handle-seek player [position])))

(defmethod handle-fast-forward :stream [player]
  player) ; we don't support this operation on stream atm

(defmulti handle-finished
  "Does housekeeping after the source material ended. For ex, prepares player to
  be ready for playback from the beginning. Starts the playback again when loop
  option is true."
  source-type)

(defmethod handle-finished :recorded [player]
  (when (:loop player)
    (dispatch player [:toggle-play]))
  (-> player
      (update-in [:source] dissoc :stop)
      (assoc :start-at 0) ; TODO: move this to source?
      (assoc :current-time (:duration player))))

(defmethod handle-finished :stream [player]
  player) ; TODO: what to do here for stream?

(defn speed-up [speed]
  (* speed 2))

(defn speed-down [speed]
  (/ speed 2))

(defmulti handle-speed-change
  "Alters the speed of the playback by applying change-fn to the current speed."
  (fn [change-fn player]
    (source-type player)))

(defmethod handle-speed-change :recorded [change-fn player]
  (if (playing? player)
    (let [t ((-> player :source :stop))]
      (-> player
          (update-in [:start-at] + t)
          (update-in [:speed] change-fn)
          start-playback))
    (update-in player [:speed] change-fn)))

(defmethod handle-speed-change :stream [change-fn player]
  player) ; we don't support this operation on stream

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

(defn acc->frame [acc]
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
  "Given fetched asciicast extracts necessary data from it and prepares the
  player for playback."
  (fn [player asciicast]
    (if (vector? asciicast)
      0
      (:version asciicast))))

(defmethod initialize-asciicast 0 [player asciicast]
  (let [frame-0-lines (-> asciicast first last :lines)
        asciicast-width (->> frame-0-lines vals first (map #(count (first %))) (reduce +))
        asciicast-height (count frame-0-lines)]
    (assoc player
           :loading false
           :width (or (:width player) asciicast-width)
           :height (or (:height player) asciicast-height)
           :frame-fn acc->frame
           :duration (reduce #(+ %1 (first %2)) 0 asciicast)
           :source {:type :recorded
                    :frames (build-v0-frames asciicast)})))

(defn initialize-asciicast-with-stdout [player asciicast]
  (assoc player
         :loading false
         :width (or (:width player) (:width asciicast))
         :height (or (:height player) (:height asciicast))
         :frame-fn vt->frame
         :duration (reduce #(+ %1 (first %2)) 0 (:stdout asciicast))
         :source {:type :recorded
                  :frames (build-v1-frames asciicast)}))

(defn initialize-asciicast-with-stream [player asciicast]
  (assoc player
         :width (or (:width player) (:width asciicast))
         :height (or (:height player) (:height asciicast))
         :frame-fn vt->frame
         :source {:type :stream
                  :url (:stream_url asciicast)
                  :width (:width asciicast)
                  :height (:height asciicast)}))

(defmethod initialize-asciicast 1 [player asciicast]
  (initialize-asciicast-with-stdout player asciicast))

(defmethod initialize-asciicast 2 [player asciicast]
  (if (:stream_url asciicast)
    (initialize-asciicast-with-stream player asciicast)
    (initialize-asciicast-with-stdout player asciicast)))

(defmethod initialize-asciicast :default [player asciicast]
  (throw (str "unsupported asciicast version: " (:version asciicast))))

(defn handle-asciicast-response
  "Parses given asciicast JSON, initializes the player with it and triggers
  playback."
  [player [json]]
  (dispatch player [:toggle-play])
  (let [asciicast (-> json
                      js/JSON.parse
                      (util/faster-js->clj :keywordize-keys true))]
    (initialize-asciicast player asciicast)))

(defn handle-bad-response [player resp]
  (print "error fetching asciicast file:")
  (prn resp)
  (hide-spinner player))

(defn handle-stream-connected
  "Hides loading indicator. Called when stream connects."
  [player]
  (hide-spinner player))

(defn handle-stream-disconnected
  "Shows loading indicator. Called when stream disconnects."
  [player]
  (show-spinner player))

(defn handle-frame
  "Updates screen with given frame and resets cursor visibility."
  [player [frame]]
  (-> player
      (update-screen frame)
      reset-blink))

(defn handle-blink
  "Shows or hides the cursor."
  [player [cursor-on?]]
  (assoc-in player [:cursor :on] cursor-on?))

(defn handle-time
  "Updates player's current time (as displayed in control bar)."
  [player [t]]
  (assoc player :current-time t))

(def event-handlers {:toggle-play handle-toggle-play
                     :seek handle-seek
                     :rewind handle-rewind
                     :fast-forward handle-fast-forward
                     :finished handle-finished
                     :speed-up (partial handle-speed-change speed-up)
                     :speed-down (partial handle-speed-change speed-down)
                     :asciicast-response handle-asciicast-response
                     :bad-response handle-bad-response
                     :stream-connected handle-stream-connected
                     :stream-disconnected handle-stream-disconnected
                     :frame handle-frame
                     :blink handle-blink
                     :time handle-time})

(defn process-event
  "Finds handler for the given event and applies it to the player."
  [player [event-name & args]]
  (if-let [handler (get event-handlers event-name)]
    (handler player args)
    (do
      (print "unhandled event:" event-name)
      player)))

(defn activity-chan
  "Converts given channel into an activity indicator channel. The resulting
  channel emits false when there are no reads on input channel within msec, then
  true when new values show up on input, then false again after msec without
  reads on input, and so on."
  [input msec]
  (let [out (chan)]
    (go-loop []
      ;; wait for activity on input channel
      (<! input)
      (>! out true)

      ;; wait for inactivity on input channel
      (loop []
        (let [t (timeout msec)
              [_ c] (alts! [input t])]
          (when (= c input)
            (recur))))
      (>! out false)

      (recur))
    out))

(defn start-event-loop!
  "Starts event processing loop. It handles both internal and user triggered events. Updates Reagent atom with the result of event handler."
  [player-atom]
  (let [events (chan)
        mouse-moves (chan (dropping-buffer 1))
        user-activity (activity-chan mouse-moves 3000)]
    (go-loop []
      (let [[event-name & _ :as event] (<! events)]
        (if (= event-name :mouse-move)
          (put! mouse-moves true)
          (swap! player-atom process-event event))
        (recur)))
    (go-loop []
      (swap! player-atom assoc :show-hud (<! user-activity))
      (recur))
    (when (:auto-play @player-atom)
      (put! events [:toggle-play]))
    (swap! player-atom assoc :event-ch events)))

(defn mount-player-with-ratom
  "Mounts player's Reagent component in DOM and starts event loop."
  [player-atom dom-node]
  (let [view-event-handler (fn [event]
                             (dispatch @player-atom event)
                             nil)]
    (start-event-loop! player-atom)
    (reagent/render-component [view/player player-atom view-event-handler] dom-node)
    nil)) ; TODO: return JS object with control functions (play/pause) here

(defn create-player
  "Creates the player with the state built from given options by starting event
  processing loop and mounting Reagent component in DOM."
  [dom-node url options]
  (let [dom-node (if (string? dom-node) (.getElementById js/document dom-node) dom-node)
        state (make-player-ratom url options)]
    (mount-player-with-ratom state dom-node)))

(defn ^:export CreatePlayer
  "JavaScript API for creating the player, delegating to create-player."
  ([dom-node url] (CreatePlayer dom-node url {}))
  ([dom-node url options]
   (let [options (-> options
                     (js->clj :keywordize-keys true)
                     (rename-keys {:autoPlay :auto-play
                                   :fontSize :font-size
                                   :snapshot :poster
                                   :authorURL :author-url
                                   :startAt :start-at
                                   :authorImgURL :author-img-url}))]
     (create-player dom-node url options))))

(enable-console-print!)
