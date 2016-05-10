(ns asciinema.player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema.player.view :as view]
            [asciinema.player.vt :as vt]
            [asciinema.player.messages :as m]
            [asciinema.player.processing]
            [asciinema.player.source :as source :refer [make-source]]
            [schema.core :as s]
            [cljs.core.async :refer [chan >! <! put! timeout dropping-buffer]]
            [clojure.string :as str]
            [clojure.set :as set])
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
  (let [vt-width (or width 80)
        vt-height (or height 24)
        start-at (or (parse-npt start-at) 0)
        {poster-screen :screen poster-time :time} (parse-poster poster vt-width vt-height)
        poster-time (or poster-time (when (and (not poster-screen) (> start-at 0)) start-at))
        source (make-source url {:type type
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

(defn start-message-loop!
  "Starts message processing loop. Updates Reagent atom with the result applying
  a message to player state."
  [player-atom initial-channels]
  (let [channels (atom initial-channels)]
    (go-loop []
      (let [[message channel] (alts! (seq @channels))]
        (when (nil? message)
          (swap! channels disj channel))

        (when (satisfies? m/Update message)
          (swap! player-atom #(m/update-player message %)))

        (when (satisfies? m/ChannelSource message)
          (swap! channels set/union (m/get-channels message @player-atom))))
      (recur))))

(defn mount-player-with-ratom
  "Mounts player's Reagent component in DOM and starts message loop."
  [player-atom source-ch dom-node]
  (let [ui-ch (chan)
        view-message-handler (fn [message]
                               (put! ui-ch message)
                               nil)]
    (start-message-loop! player-atom #{ui-ch source-ch})
    (reagent/render-component [view/player player-atom view-message-handler] dom-node)
    nil)) ; TODO: return JS object with control functions (play/pause) here

(defn create-player
  "Creates the player with the state built from given options by starting
  message processing loop and mounting Reagent component in DOM."
  [dom-node url options]
  (let [dom-node (if (string? dom-node) (.getElementById js/document dom-node) dom-node)
        player-ratom (make-player-ratom url options)
        source-ch (source/init (:source @player-ratom))]
    (mount-player-with-ratom player-ratom source-ch dom-node)))

(enable-console-print!)
