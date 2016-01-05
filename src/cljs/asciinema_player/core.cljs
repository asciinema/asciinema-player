(ns asciinema-player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema-player.view :as view]
            [asciinema-player.util :as util]
            [asciinema-player.vt :as vt]
            [cljs.core.async :refer [chan >! <! put! timeout close! dropping-buffer]]
            [clojure.walk :as walk]
            [clojure.set :refer [rename-keys]]
            [ajax.core :refer [GET]])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(defn make-player
  "Returns fresh player state for given options."
  [asciicast-url {:keys [width height speed snapshot font-size theme start-at auto-play]
                  :or {speed 1 snapshot [] font-size "small" theme "asciinema"}
                  :as options}]
  (let [auto-play (if (nil? auto-play) (boolean start-at) auto-play)
        start-at (or start-at 0)]
    (merge {:width width
            :height height
            :duration 0
            :asciicast-url asciicast-url
            :speed speed
            :auto-play auto-play
            :lines snapshot
            :font-size font-size
            :theme theme
            :cursor {:visible false}
            :start-at start-at
            :current-time start-at
            :show-hud false}
           (select-keys options [:loop :title :author :author-url :author-img-url]))))

(defn make-player-ratom
  "Returns Reagent atom with fresh player state."
  [& args]
  (atom (apply make-player args)))

(defn elapsed-time-since
  "Returns wall time (in seconds) elapsed since then."
  [then]
  (/ (- (.getTime (js/Date.)) (.getTime then)) 1000))

(defn update-screen
  "Extracts screen state (line content and cursor attributes) from given frame
  payload and applies it to player's state."
  [{:keys [frame-fn] :as state} frame]
  (let [{:keys [lines cursor]} (frame-fn frame)]
    (-> state
        (assoc :lines lines)
        (update-in [:cursor] merge cursor))))

(defn coll->chan
  "Returns a channel that emits frames from the given collection.
  The difference from core.async/to-chan is this function expects elements of
  the collection to be tuples of [delay data], and it emits data after delay
  (sec) for each element. It tries to always stay 'on the schedule' by measuring
  elapsed time and skipping elements if necessary. When reducer and init given
  it reduces consecutive elements instead of skipping."
  ([coll] (coll->chan coll (fn [_ v] v) nil))
  ([coll reducer init]
   (let [ch (chan)
         start (js/Date.)
         reducer (fnil reducer init)]
     (go
       (loop [coll coll
              virtual-time 0
              wall-time (elapsed-time-since start)
              acc nil]
         (if-let [[delay data] (first coll)]
           (let [new-virtual-time (+ virtual-time delay)
                 ahead (- new-virtual-time wall-time)]
             (if (pos? ahead)
               (do
                 (when-not (nil? acc)
                   (>! ch acc))
                 (<! (timeout (* 1000 ahead)))
                 (>! ch data)
                 (recur (rest coll) new-virtual-time (elapsed-time-since start) nil))
               (recur (rest coll) new-virtual-time wall-time (reducer acc data)))))
         (when-not (nil? acc)
           (>! ch acc)))
       (close! ch))
     ch)))

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

(defn next-frames
  "Returns a lazy sequence of frames starting from given time (in seconds)."
  [frames seconds]
  (lazy-seq
   (if (seq frames)
     (let [[delay screen-state] (first frames)]
       (if (<= delay seconds)
         (next-frames (rest frames) (- seconds delay))
         (cons [(- delay seconds) screen-state] (rest frames))))
     frames)))

(defn reset-blink
  "Makes cursor 'block' visible."
  [state]
  (assoc-in state [:cursor :on] true))

(defn make-cursor-blink-chan
  "Returns a channel emitting true/false/true/false/... in 0.5 sec periods."
  []
  (coll->chan (cycle [[0.5 false] [0.5 true]])))

(defn frames-at-speed [frames speed]
  (map (fn [[delay screen-state]] [(/ delay speed) screen-state]) frames))

(defn start-playback
  "The heart of the player. Coordinates dispatching of state update events like
  terminal line updating, time reporting and cursor blinking.
  Returns function which stops the playback and returns time of the playback."
  [state dispatch]
  (let [start (js/Date.)
        start-at (:start-at state)
        speed (:speed state)
        frames (-> (:frames state) (next-frames start-at) (frames-at-speed speed))
        screen-state-chan (coll->chan frames)
        timer-chan (coll->chan (repeat [0.3 true]))
        stop-playback-chan (chan)
        elapsed-time #(* (elapsed-time-since start) speed)
        stop-fn (fn []
                  (close! stop-playback-chan)
                  (elapsed-time))]
    (go
      (loop [cursor-blink-chan (make-cursor-blink-chan)]
        (let [[v c] (alts! [screen-state-chan timer-chan cursor-blink-chan stop-playback-chan])]
          (condp = c
            timer-chan (let [t (+ start-at (elapsed-time))]
                         (dispatch [:update-state assoc :current-time t])
                         (recur cursor-blink-chan))
            cursor-blink-chan (do
                                (dispatch [:update-state assoc-in [:cursor :on] v])
                                (recur cursor-blink-chan))
            screen-state-chan (if v
                                (do
                                  (dispatch [:update-state #(-> % (update-screen v) reset-blink)])
                                  (recur (make-cursor-blink-chan)))
                                (dispatch [:finished]))
            stop-playback-chan nil))) ; do nothing, break the loop
      (dispatch [:update-state reset-blink]))
    (-> state
        (update-screen (screen-state-at (:frames state) start-at))
        (assoc :stop stop-fn))))

(defn stop-playback
  "Stops the playback and returns updated state with new start position."
  [state]
  (let [t ((:stop state))]
    (-> state
        (dissoc :stop)
        (update-in [:start-at] + t))))

(defn fetch-asciicast
  "Fetches asciicast JSON file, setting :loading to true at the start,
  dispatching :asciicast-response event on success, :bad-response event on
  failure."
  [state dispatch]
  (let [url (:asciicast-url state)]
    (GET url
         {:response-format :raw
          :handler #(dispatch [:asciicast-response %])
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
    (fetch-asciicast state dispatch)))

(defn handle-seek
  "Jumps to a given position (in seconds)."
  [state dispatch [position]]
  (let [new-time (* position (:duration state))
        screen-state (screen-state-at (:frames state) new-time)
        playing? (contains? state :stop)]
    (when playing?
      ((:stop state)))
    (let [new-state (-> state
                        (assoc :current-time new-time :start-at new-time)
                        (update-screen screen-state))]
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
  (-> state
      (dissoc :stop)
      (assoc :start-at 0)
      (assoc :current-time (:duration state))))

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
          (update-in [:start-at] + t)
          (update-in [:speed] change-fn)
          (start-playback dispatch)))
    (update-in state [:speed] change-fn)))

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

(defn initialize-asciicast-v0 [state asciicast]
  (let [frame-0-lines (-> asciicast first last :lines)
        width (->> frame-0-lines vals first (map #(count (first %))) (reduce +))
        height (count frame-0-lines)]
    (assoc state
           :width (or (:width state) width)
           :height (or (:height state) height)
           :frame-fn acc->frame
           :duration (reduce #(+ %1 (first %2)) 0 asciicast)
           :frames (build-v0-frames asciicast))))

(defn initialize-asciicast-v1 [state asciicast]
  (assoc state
         :width (or (:width state) (:width asciicast))
         :height (or (:height state) (:height asciicast))
         :frame-fn vt->frame
         :duration (reduce #(+ %1 (first %2)) 0 (:stdout asciicast))
         :frames (build-v1-frames asciicast)))

(defn initialize-asciicast
  "Prepares fetched asciicast for playback."
  [state asciicast]
  (cond (vector? asciicast) (initialize-asciicast-v0 state asciicast)
        (= 1 (:version asciicast)) (initialize-asciicast-v1 state asciicast)
        :else (throw (str "unsupported asciicast version: " (:version asciicast)))))

(defn handle-asciicast-response
  "Merges asciicast frames into player state, hides loading indicator and starts the
  playback."
  [state dispatch [json]]
  (dispatch [:toggle-play])
  (let [asciicast (-> json
                      js/JSON.parse
                      (util/faster-js->clj :keywordize-keys true))]
    (-> state
        (assoc :loading false)
        (initialize-asciicast asciicast))))

(defn handle-bad-response [state dispatch resp]
  (print "error fetching asciicast file:")
  (prn resp)
  (assoc state :loading false))

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
                     :asciicast-response handle-asciicast-response
                     :bad-response handle-bad-response
                     :update-state handle-update-state})

(defn process-event
  "Finds handler for the given event and applies it to the player state."
  [state dispatch [event-name & args]]
  (if-let [handler (get event-handlers event-name)]
    (handler state dispatch args)
    (do
      (print "unhandled event:" event-name)
      state)))

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
  "Starts event processing loop and returns function for dispatching events."
  [state]
  (let [events (chan)
        mouse-moves (chan (dropping-buffer 1))
        user-activity (activity-chan mouse-moves 3000)
        dispatch (fn [[event-name & args :as event]]
                   (if (= event-name :mouse-move)
                     (put! mouse-moves true)
                     (put! events event))
                   nil)]
    (go-loop []
      (swap! state process-event dispatch (<! events))
      (recur))
    (go-loop []
      (swap! state assoc :show-hud (<! user-activity))
      (recur))
    (when (:auto-play @state)
      (dispatch [:toggle-play]))
    dispatch))

(defn create-player-with-state
  "Creates the player with given state, mounting top Reagent component in DOM."
  [state dom-node]
  (let [dispatch (start-event-loop! state)]
    (reagent/render-component [view/player state dispatch] dom-node)
    nil)) ; TODO: return JS object with control functions (play/pause) here

(defn create-player
  "Creates the player with the state built from given options by starting event
  processing loop and mounting Reagent component in DOM."
  [dom-node asciicast-url options]
  (let [dom-node (if (string? dom-node) (.getElementById js/document dom-node) dom-node)
        state (make-player-ratom asciicast-url options)]
    (create-player-with-state state dom-node)))

(defn ^:export CreatePlayer
  "JavaScript API for creating the player, delegating to create-player."
  ([dom-node asciicast-url] (CreatePlayer dom-node asciicast-url {}))
  ([dom-node asciicast-url options]
   (let [options (-> options
                     (js->clj :keywordize-keys true)
                     (rename-keys {:autoPlay :auto-play
                                   :fontSize :font-size
                                   :authorURL :author-url
                                   :startAt :start-at
                                   :authorImgURL :author-img-url}))]
     (create-player dom-node asciicast-url options))))

(enable-console-print!)
