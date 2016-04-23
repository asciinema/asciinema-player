(ns asciinema.player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema.player.view :as view]
            [asciinema.player.util :as util]
            [asciinema.player.raf :as raf]
            [asciinema.player.vt :as vt]
            [asciinema.player.source :as source :refer [make-source]]
            [cljs.core.async :refer [chan >! <! put! timeout close! sliding-buffer dropping-buffer]]
            [clojure.string :as str])
  (:require-macros [cljs.core.async.macros :refer [go-loop]]))

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
  "Builds initial player for given URL and options."
  [url {:keys [type width height speed loop auto-play preload poster font-size theme start-at]
        :or {type :asciicast speed 1 font-size "small" theme "asciinema"}
        :as options}]
  (let [start-at (parse-npt (or start-at 0))
        events-ch (chan)
        vt-width (or width 80)
        vt-height (or height 24)
        source (make-source type events-ch url vt-width vt-height start-at speed auto-play loop preload)]
    (merge {:width width
            :height height
            :current-time start-at
            :duration nil
            :speed speed
            :playing false
            :loading false
            :loaded false
            :source source
            :events-ch events-ch
            :lines (or (parse-poster poster vt-width vt-height) [])
            :cursor {:visible false}
            :cursor-blink-ch nil
            :font-size font-size
            :theme theme
            :show-hud false}
           (select-keys options [:title :author :author-url :author-img-url]))))

(defn make-player-ratom
  "Returns Reagent atom with initial player state."
  [& args]
  (atom (apply make-player args)))

(defn dispatch [player event]
  (put! (:events-ch player) event))

(defn update-screen
  "Extracts screen state (line content and cursor attributes) from given payload
  (a ref, possibly a delay) and applies it to player."
  [player screen]
  (let [{:keys [lines cursor]} @screen]
    (-> player
        (assoc :lines lines)
        (update-in [:cursor] merge cursor))))

(def blinks
  "Infinite seq of cursor blinks."
  (cycle [[0.5 false] [0.5 true]]))

(defn start-blinking [{:keys [events-ch] :as player}]
  (let [cursor-blink-ch (chan)]
    (source/emit-events :blink blinks identity events-ch cursor-blink-ch)
    (-> player
        (assoc-in [:cursor :on] true)
        (assoc :cursor-blink-ch cursor-blink-ch))))

(defn stop-blinking [{:keys [cursor-blink-ch] :as player}]
  (close! cursor-blink-ch)
  (-> player
      (assoc-in [:cursor :on] true)
      (assoc :cursor-blink-ch nil)))

(defn restart-blinking [{:keys [cursor-blink-ch] :as player}]
  (if cursor-blink-ch
    (-> player
        stop-blinking
        start-blinking)
    player))

(defn handle-toggle-play
  "Toggles the playback on the source."
  [{:keys [source] :as player}]
  (source/toggle source)
  player)

(defn handle-seek
  "Jumps to a given position (in seconds)."
  [{:keys [duration source] :as player} [position]]
  (when duration
    (let [new-time (* position duration)]
      (source/seek source new-time)))
  player)

(defn new-start-at
  "Returns time adjusted by given offset, clipped to the range 0..total-time."
  [current-time total-time offset]
  (util/adjust-to-range (+ current-time offset) 0 total-time))

(defn handle-rewind
  "Rewinds the playback by 5 seconds."
  [{:keys [current-time duration source] :as player}]
  (when duration
    (let [new-time (new-start-at current-time duration -5)]
      (source/seek source new-time)))
  player)

(defn handle-fast-forward
  "Fast-forwards the playback by 5 seconds."
  [{:keys [current-time duration source] :as player}]
  (when duration
    (let [new-time (new-start-at current-time duration 5)]
      (source/seek source new-time)))
  player)

(defn speed-up [speed]
  (* speed 2))

(defn speed-down [speed]
  (/ speed 2))

(defn handle-speed-change
  "Alters the speed of the playback to the result of applying change-fn to the
  current speed."
  [change-fn {:keys [playing speed source] :as player}]
  (let [new-speed (change-fn speed)]
    (source/change-speed source new-speed)
    (assoc player :speed new-speed)))

(defn handle-screen
  "Updates screen with given lines/cursor and resets cursor blinking."
  [player [screen]]
  (-> player
      (update-screen screen)
      restart-blinking))

(defn handle-loading
  "Shows/hides loading indicator."
  [player [loading?]]
  (assoc player :loading loading?))

(defn handle-playing
  "Toggle the play/pause button and start/stops cursor blinking."
  [player [playing?]]
  (let [player (assoc player :playing playing? :loaded true)]
    (if playing?
      (start-blinking player)
      (stop-blinking player))))

(defn handle-blink
  "Shows or hides the cursor block."
  [player [cursor-on?]]
  (assoc-in player [:cursor :on] cursor-on?))

(defn handle-time
  "Updates player's current time (as displayed in control bar)."
  [player [t]]
  (assoc player :current-time t))

(defn handle-duration
  "Sets the total playback time."
  [player [d]]
  (assoc player :duration d))

(defn handle-size
  "Sets player's width and height if not already set."
  [{player-width :width player-height :height :as player} [width height]]
  (-> player
      (assoc :width (or player-width width))
      (assoc :height (or player-height height))))

(def event-handlers {:blink handle-blink
                     :duration handle-duration
                     :fast-forward handle-fast-forward
                     :screen handle-screen
                     :loading handle-loading
                     :playing handle-playing
                     :rewind handle-rewind
                     :seek handle-seek
                     :size handle-size
                     :speed-down (partial handle-speed-change speed-down)
                     :speed-up (partial handle-speed-change speed-up)
                     :time handle-time
                     :toggle-play handle-toggle-play})

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
  "Starts event processing loop. It handles both internal and user triggered
  events. Updates Reagent atom with the result of event handler."
  [player-atom]
  (let [events-ch (:events-ch @player-atom)
        mouse-moves-ch (chan (dropping-buffer 1))
        user-activity-ch (activity-chan mouse-moves-ch 3000)]
    (go-loop []
      (let [[event-name & _ :as event] (<! events-ch)]
        (condp = event-name
          :mouse-move (>! mouse-moves-ch true)
          (swap! player-atom process-event event)))
      (recur))
    (go-loop []
      (let [show? (<! user-activity-ch)]
        (when-not (nil? show?)
          (swap! player-atom assoc :show-hud show?)
          (recur))))))

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
        player-ratom (make-player-ratom url options)]
    (source/init (:source @player-ratom))
    (mount-player-with-ratom player-ratom dom-node)))

(enable-console-print!)
