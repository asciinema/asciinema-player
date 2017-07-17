(ns asciinema.player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema.player.view :as view]
            [asciinema.player.screen :as screen]
            [asciinema.vt :as vt]
            [asciinema.player.messages :as m]
            [asciinema.player.processing]
            [asciinema.player.source :as source :refer [make-source]]
            [schema.core :as s]
            [clojure.string :as str]))

(defn parse-npt [t]
  (when t
    (let [numbers (map js/parseFloat (str/split (str t) #":"))
          components (map * (reverse numbers) (iterate #(* 60 %) 1))]
      (apply + components))))

(s/defn parse-json-poster :- (s/protocol screen/Screen)
  [json :- s/Str]
  (let [lines (-> json
                  (.replace (js/RegExp. "\\s" "g") "")
                  js/atob
                  js/JSON.parse
                  (js->clj :keywordize-keys true))]
    {:lines lines}))

(s/defn parse-text-poster :- (s/protocol screen/Screen)
  [text :- s/Str
   width :- s/Num
   height :- s/Num]
  (-> (vt/make-vt width height)
      (vt/feed-str text)))

(defn parse-poster [poster width height]
  (when poster
    (if (string? poster)
      (condp #(zero? (.indexOf %2 %1)) poster
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
        poster-time (or poster-time (when (and (not poster-screen) (pos? start-at)) start-at))
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
           (select-keys options [:title :author :author-url :author-img-url
                                 :on-can-play :on-play :on-pause]))))

(defn make-player-ratom
  "Returns Reagent atom with initial player state."
  [& args]
  (atom (apply make-player args)))

(defn mount-player-with-ratom
  "Mounts player's Reagent component at given DOM element."
  [player-atom dom-node]
  (reagent/render-component [view/player-component player-atom] dom-node)
  nil)

(defn create-player
  "Creates initial player state and mounts player's Reagent component at given
  DOM element."
  [dom-node url options]
  (let [dom-node (if (string? dom-node) (.getElementById js/document dom-node) dom-node)
        player-ratom (make-player-ratom url options)]
    (mount-player-with-ratom player-ratom dom-node)
    player-ratom))

(defn unmount-player
  "Unmounts player's Reagent component from given DOM element."
  [dom-node]
  (let [dom-node (if (string? dom-node) (.getElementById js/document dom-node) dom-node)]
    (reagent/unmount-component-at-node dom-node)))

(def get-current-time :current-time)
(def get-duration :duration)

(defn play [{:keys [source]}]
  (source/start source))

(defn pause [{:keys [source]}]
  (source/stop source))

(defn seek [{:keys [duration source] :as player} new-time]
  (source/seek source new-time))

(enable-console-print!)
