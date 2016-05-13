(ns asciinema.player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema.player.view :as view]
            [asciinema.player.util :as util]
            [asciinema.player.raf :as raf]
            [asciinema.player.vt :as vt]
            [asciinema.player.source :as source :refer [make-source]]
            [schema.core :as s]
            [cljs.core.async :refer [chan >! <! put! timeout close! dropping-buffer]]
            [clojure.string :as str])
  (:require-macros [cljs.core.async.macros :refer [go-loop]]))

(defn parse-npt [t]
  (when t
    (let [numbers (map js/parseFloat (str/split (str t) #":"))
          components (map * (reverse numbers) (iterate (partial * 60) 1))]
      (apply + components))))

(s/defn parse-json-poster :- (s/protocol view/TerminalView)
  [json :- s/Str]
  (let [lines (-> json
                  (.replace (js/RegExp. "\\s" "g") "")
                  js/atob
                  js/JSON.parse
                  (js->clj :keywordize-keys true))]
    {:lines lines}))

(s/defn parse-text-poster :- (s/protocol view/TerminalView)
  [text :- s/Str
   width :- s/Num
   height :- s/Num]
  (-> (vt/make-vt width height)
      (vt/feed-str text)))

(defn parse-poster [poster width height]
  (when poster
    (if (string? poster)
      (condp #(= (.indexOf %2 %1) 0) poster
        "data:application/json;base64," {:screen (-> poster (.substring 29) parse-json-poster)}
        "data:text/plain," {:screen (-> poster (.substring 16) (parse-text-poster width height))}
        "npt:" {:time (-> poster (.substring 4) parse-npt)}
        nil)
      {:screen {:lines poster}})))

(def blank-screen {:cursor {:visible false}
                   :lines []})

(defn make-player
  "Builds initial player for given URL and options."
  [url {:keys [type width height start-at speed loop auto-play preload poster font-size theme]
        :or {speed 1 loop false auto-play false preload false font-size "small" theme "asciinema"}
        :as options}]
  (let [events-ch (chan)
        vt-width (or width 80)
        vt-height (or height 24)
        start-at (or (parse-npt start-at) 0)
        {poster-screen :screen poster-time :time} (parse-poster poster vt-width vt-height)
        poster-time (or poster-time (when (and (not poster-screen) (> start-at 0)) start-at))
        source (make-source url {:events-ch events-ch
                                 :type type
                                 :width vt-width
                                 :height vt-height
                                 :start-at start-at
                                 :speed speed
                                 :auto-play auto-play
                                 :loop loop
                                 :preload preload
                                 :poster-time poster-time})]
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
            :screen (or poster-screen blank-screen)
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
  "Sets the screen contents to be displayed."
  [player screen]
  (assoc player :screen screen))

(def blinks
  "Infinite seq of cursor blinks."
  (iterate (fn [[t b]]
             (vector (+ t 0.5) (not b)))
           [0.5 false]))

(defn start-blinking [{:keys [events-ch] :as player}]
  (let [cursor-blink-ch (chan)]
    (source/emit-events :blink blinks 0 events-ch cursor-blink-ch)
    (-> player
        (assoc :cursor-on true)
        (assoc :cursor-blink-ch cursor-blink-ch))))

(defn stop-blinking [{:keys [cursor-blink-ch] :as player}]
  (close! cursor-blink-ch)
  (-> player
      (assoc :cursor-on true)
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

(defn handle-visibility-change
  "Stops the playback when the player is hidden."
  [{:keys [source] :as player}]
    (if js/document.hidden
      (source/stop source))
  player)

(defn handle-blink
  "Shows or hides the cursor block."
  [player [cursor-on?]]
  (assoc player :cursor-on cursor-on?))

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
                     :visibility-change handle-visibility-change
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

; wrap the player in a component with lifecycle hooks for adding/removing document event listeners
(defn visibility-watcher [player dispatch]
  (let []
    (reagent/create-class
      {:component-did-mount (fn [this]
        (def listener (.addEventListener js/document "visibilitychange" (fn [event]
          (dispatch [:visibility-change])
          ))))
       :component-will-unmount (fn [this]
         (.removeEventListener js/document "visibilitychange" listener))
       :reagent-render (fn [this]
         [view/player player dispatch]
        )})))

(defn mount-player-with-ratom
  "Mounts player's Reagent component in DOM and starts event loop."
  [player-atom dom-node]
  (let [view-event-handler (fn [event]
                             (dispatch @player-atom event)
                             nil)]
    (start-event-loop! player-atom)
    (reagent/render-component [visibility-watcher player-atom view-event-handler] dom-node)
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
