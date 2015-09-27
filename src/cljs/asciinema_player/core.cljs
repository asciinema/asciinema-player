(ns asciinema-player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema-player.view :as view]
            [asciinema-player.util :as util]
            [cljs.core.async :refer [chan >! <! timeout close!]]
            [clojure.walk :as walk]
            [clojure.set :refer [rename-keys]]
            [ajax.core :refer [GET]])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(defn make-player-state
  "Returns Reagent atom with fresh player state."
  [width height frames-url duration {:keys [speed snapshot auto-play loop font-size theme] :or {speed 1 snapshot [] auto-play false loop false font-size "small" theme "seti"}}]
  (atom {
         :width width
         :height height
         :duration duration
         :frames-url frames-url
         :font-size font-size
         :theme theme
         :lines (into (sorted-map) (map-indexed vector snapshot))
         :cursor {:on true}
         :play-from 0
         :current-time 0
         :autoplay auto-play
         :loop loop
         :speed speed}))

(defn elapsed-time-since
  "Returns wall time (in seconds) elapsed since then."
  [then]
  (/ (- (.getTime (js/Date.)) (.getTime then)) 1000))

(defn apply-diff
  "Applies given diff (line content and cursor position changes) to player's
  state."
  [state {:keys [lines cursor]}]
  (merge-with merge state {:lines lines :cursor cursor}))

(defn coll->chan
  "Returns a channel that emits values from the given collection.
  The difference from core.async/to-chan is this function expects elements of
  the collection to be tuples of [delay data], and it emits data after
  delay (sec) for each element."
  [coll]
  (let [ch (chan)]
    (go
      (loop [coll coll]
        (when-let [[delay data] (first coll)]
          (<! (timeout (* 1000 delay)))
          (>! ch data)
          (recur (rest coll))))
      (close! ch))
    ch))

(defn frames->chan
  "Returns a channel that emits frames from the given collection."
  [frames speed]
  (let [ch (chan)
        start (js/Date.)]
    (go
      (loop [frames frames
             virtual-time 0
             pending-diff {}]
        (when-let [[delay diff] (first frames)]
          (let [wall-time (* (elapsed-time-since start) speed)
                new-virtual-time (+ virtual-time delay)
                ahead (- new-virtual-time wall-time)]
            (if (pos? ahead)
              (do
                (when-not (empty? pending-diff)
                  (>! ch pending-diff))
                (<! (timeout (/ (* 1000 ahead) speed)))
                (>! ch diff)
                (recur (rest frames) new-virtual-time {}))
              (recur (rest frames) new-virtual-time (merge-with merge pending-diff diff))))))
      (close! ch))
    ch))

(defn prev-diff
  "Returns a combined diff from frames up to (and including) given time (in
  seconds)."
  [frames seconds]
  (loop [frames frames
         seconds seconds
         candidate nil]
    (let [[delay diff :as frame] (first frames)]
      (if (or (nil? frame) (< seconds delay))
        candidate
        (recur (rest frames) (- seconds delay) (merge-with merge candidate diff))))))

(defn next-frames
  "Returns a lazy sequence of frames starting from given time (in seconds)."
  [frames seconds]
  (lazy-seq
    (if (seq frames)
      (let [[delay diff] (first frames)]
        (if (<= delay seconds)
          (next-frames (rest frames) (- seconds delay))
          (cons [(- delay seconds) diff] (rest frames))))
      frames)))

(defn reset-blink
  "Makes cursor 'block' visible."
  [state]
  (assoc-in state [:cursor :on] true))

(defn make-cursor-blink-chan
  "Returns a channel emitting true/false/true/false/... in 0.5 sec periods."
  []
  (coll->chan (cycle [[0.5 false] [0.5 true]])))

(defn start-playback
  "The heart of the player. Coordinates dispatching of state update events like
  terminal line updating, time reporting and cursor blinking.
  Returns function which stops the playback and returns time of the playback."
  [state dispatch]
  (let [start (js/Date.)
        play-from (:play-from state)
        speed (:speed state)
        frames (-> (:frames state) (next-frames play-from))
        diff-chan (frames->chan frames speed)
        timer-chan (coll->chan (repeat [0.3 true]))
        stop-playback-chan (chan)
        elapsed-time #(* (elapsed-time-since start) speed)
        stop-fn (fn []
                  (close! stop-playback-chan)
                  (elapsed-time))]
    (go
      (loop [cursor-blink-chan (make-cursor-blink-chan)]
        (let [[v c] (alts! [diff-chan timer-chan cursor-blink-chan stop-playback-chan])]
          (condp = c
            timer-chan (let [t (+ play-from (elapsed-time))]
                         (dispatch [:update-state assoc :current-time t])
                         (recur cursor-blink-chan))
            cursor-blink-chan (do
                                (dispatch [:update-state assoc-in [:cursor :on] v])
                                (recur cursor-blink-chan))
            diff-chan (if v
                        (do
                          (dispatch [:update-state #(-> % (apply-diff v) reset-blink)])
                          (recur (make-cursor-blink-chan)))
                        (do
                          (dispatch [:finished])
                          (print (str "finished in " (elapsed-time-since start)))))
            stop-playback-chan nil))) ; do nothing, break the loop
      (dispatch [:update-state reset-blink]))
    (-> state
        (apply-diff (prev-diff (:frames state) play-from))
        (assoc :stop stop-fn))))

(defn stop-playback
  "Stops the playback and returns updated state with new start position."
  [state]
  (let [t ((:stop state))]
    (-> state
        (dissoc :stop)
        (update-in [:play-from] + t))))

(defn- fix-line-diff-keys [line]
  (into {} (map (fn [[k v]] [(js/parseInt (name k) 10) v]) line)))

(defn- fix-diff-keys [frame]
  (update-in frame [1 :lines] fix-line-diff-keys))

(defn frames-json->clj
  "Converts keys in frames (as received as JSON) to keywords. Integer keys
  referring to line numbers are converted to integers."
  [frames]
  (map fix-diff-keys (walk/keywordize-keys frames)))

(defn fetch-frames
  "Fetches frames, setting :loading to true at the start,
  dispatching :frames-response event on success, :bad-response event on
  failure."
  [state dispatch]
  (let [url (:frames-url state)]
    (GET
     url
     {:format :json
      :handler #(dispatch [:frames-response %])
      :error-handler #(dispatch [:bad-response %])})
    (assoc state :loading true)))

(defn new-position
  "Returns time adjusted by given offset, clipped to the range 0..total-time."
  [current-time total-time offset]
  (/ (util/adjust-to-range (+ current-time offset) 0 total-time) total-time))

(defn handle-toggle-play
  "Toggles the playback. Fetches frames if they were not loaded yet."
  [state dispatch]
  (if (contains? state :frames)
    (if (contains? state :stop)
      (stop-playback state)
      (start-playback state dispatch))
    (fetch-frames state dispatch)))

(defn handle-seek
  "Jumps to a given position (in seconds)."
  [state dispatch [position]]
  (let [new-time (* position (:duration state))
        diff (prev-diff (:frames state) new-time)
        playing? (contains? state :stop)]
    (when playing?
      ((:stop state)))
    (let [new-state (-> state
                        (assoc :current-time new-time :play-from new-time)
                        (apply-diff diff))]
      (if playing?
        (start-playback new-state dispatch)
        new-state))))

(defn handle-rewind
  "Rewinds the playback by 5 seconds."
  [state dispatch]
  (let [position (new-position (:current-time state) (:duration state) -5)]
    (handle-seek state dispatch [position])))

(defn handle-fast-forward
  "Fast-forwards the playback by 5 seconds."
  [state dispatch]
  (let [position (new-position (:current-time state) (:duration state) 5)]
    (handle-seek state dispatch [position])))

(defn handle-finished
  "Prepares player to be ready for playback from the beginning. Starts the
  playback immediately when loop option is true."
  [state dispatch]
  (when (:loop state)
    (dispatch [:toggle-play]))
  (-> state (dissoc :stop) (assoc :play-from 0)))

(defn speed-up [speed]
  (* speed 2))

(defn speed-down [speed]
  (/ speed 2))

(defn handle-speed-change
  "Alters the speed of the playback by applying change-fn to the current speed."
  [change-fn state dispatch]
  (if-let [stop (:stop state)]
    (let [t (stop)]
      (-> state
          (update-in [:play-from] + t)
          (update-in [:speed] change-fn)
          (start-playback dispatch)))
    (update-in state [:speed] change-fn)))

(defn handle-frames-response
  "Merges frames into player state, hides loading indicator and starts the
  playback."
  [state dispatch [frames-json]]
  (dispatch [:toggle-play])
  (assoc state :loading false
               :frames (frames-json->clj frames-json)))

(defn handle-update-state
  "Applies given function (with args) to the player state."
  [state _ [f & args]]
  (apply f state args))

(def event-handlers {:toggle-play handle-toggle-play
                     :seek handle-seek
                     :rewind handle-rewind
                     :fast-forward handle-fast-forward
                     :finished handle-finished
                     :speed-up (partial handle-speed-change speed-up)
                     :speed-down (partial handle-speed-change speed-down)
                     :frames-response handle-frames-response
                     :update-state handle-update-state})

(defn process-event
  "Finds handler for the given event and applies it to the player state."
  [state dispatch [event-name & args]]
  (if-let [handler (get event-handlers event-name)]
    (swap! state handler dispatch args)
    (print (str "unhandled event: " event-name))))

(defn create-player-with-state
  "Creates the player with given state by starting event processing loop and
  mounting Reagent component in DOM."
  [state dom-node]
  (let [events (chan)
        dispatch (fn [event] (go (>! events event)))]
    (go-loop []
      (when-let [event (<! events)]
        (process-event state dispatch event)
        (recur)))
    (reagent/render-component [view/player state dispatch] dom-node)
    (when (:autoplay @state)
      (dispatch [:toggle-play]))
    (clj->js {:toggle (fn [] true)})))

(defn create-player
  "Creates the player with the state built from given options by starting event
  processing loop and mounting Reagent component in DOM."
  [dom-node width height frames-url duration options]
  (let [dom-node (if (string? dom-node) (.getElementById js/document dom-node) dom-node)
        state (make-player-state width height frames-url duration options)]
    (create-player-with-state state dom-node)))

(defn ^:export CreatePlayer
  "JavaScript API for creating the player, delegating to create-player."
  [dom-node width height frames-url duration options]
  (let [options (-> options
                    (js->clj :keywordize-keys true)
                    (rename-keys {:autoPlay :auto-play :fontSize :font-size}))]
    (create-player dom-node width height frames-url duration options)))

(enable-console-print!)
