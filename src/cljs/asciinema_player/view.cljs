(ns asciinema-player.view
  (:require [clojure.string :as string]
            [cljs.core.async :refer [>!]]
            [asciinema-player.util :as util]
            [asciinema-player.fullscreen :as fullscreen])
  (:require-macros [cljs.core.async.macros :refer [go]]))

(defn fg-color [fg bold?]
  (if (and fg bold? (< fg 8)) (+ fg 8) fg))

(defn bg-color [bg blink?]
  (if (and bg blink? (< bg 8)) (+ bg 8) bg))

(defn part-class-name [{:keys [fg bg bold blink underline inverse]}]
  (let [fg (fg-color fg bold)
        bg (bg-color bg blink)
        final-fg (if inverse (if bg bg "bg") fg)
        final-bg (if inverse (if fg fg "fg") bg)
        fg-class (if final-fg (str "fg-" final-fg))
        bg-class (if final-bg (str "bg-" final-bg))
        bold-class (if bold "bright")
        underline-class (if underline "underline")
        classes (filter boolean [fg-class bg-class bold-class underline-class])]
    (string/join " " classes)))

(defn part [p]
  [:span {:class-name (part-class-name (last p))} (first p)])

(defn line [parts]
  [:span.line (map-indexed (fn [idx p] ^{:key idx} [part p]) parts)])

(defn terminal-class-name [font-size]
  (str "font-" font-size))

(defn terminal [font-size lines]
  [:pre.asciinema-terminal {:class-name (terminal-class-name font-size)}
    (map-indexed (fn [idx l] ^{:key idx} [line l]) lines)])

(def logo-raw-svg "<defs> <mask id=\"small-triangle-mask\"> <rect width=\"100%\" height=\"100%\" fill=\"white\"/> <polygon points=\"508.01270189221935 433.01270189221935, 208.0127018922194 259.8076211353316, 208.01270189221927 606.217782649107\" fill=\"black\"></polygon> </mask> </defs> <polygon points=\"808.0127018922194 433.01270189221935, 58.01270189221947 -1.1368683772161603e-13, 58.01270189221913 866.0254037844386\" mask=\"url(#small-triangle-mask)\" fill=\"white\"></polygon> <polyline points=\"481.2177826491071 333.0127018922194, 134.80762113533166 533.0127018922194\" stroke=\"white\" stroke-width=\"90\"></polyline>")

(defn logo-play-icon []
  [:svg {:version "1.1" :xmlns "http://www.w3.org/2000/svg" :view-box "0 0 866.0254037844387 866.0254037844387" :class-name "icon" :dangerouslySetInnerHTML {:__html logo-raw-svg}}])

(defn play-icon []
  [:svg {:version "1.1" :xmlns "http://www.w3.org/2000/svg" :view-box "0 0 12 12" :class-name "icon"}
    [:path {:d "M1,0 L11,6 L1,12 Z"}]])

(defn pause-icon []
  [:svg {:version "1.1" :xmlns "http://www.w3.org/2000/svg" :view-box "0 0 12 12" :class-name "icon"}
    [:path {:d "M1,0 L4,0 L4,12 L1,12 Z"}]
    [:path {:d "M8,0 L11,0 L11,12 L8,12 Z"}]])

(defn expand-icon []
  [:svg {:version "1.1" :xmlns "http://www.w3.org/2000/svg" :view-box "0 0 12 12" :class-name "icon"}
    [:path {:d "M12,0 L7,0 L9,2 L7,4 L8,5 L10,3 L12,5 Z"}]
    [:path {:d "M0,12 L0,7 L2,9 L4,7 L5,8 L3,10 L5,12 Z"}]])

(defn shrink-icon []
  [:svg {:version "1.1" :xmlns "http://www.w3.org/2000/svg" :view-box "0 0 12 12" :class-name "icon"}
    [:path {:d "M7,5 L7,0 L9,2 L11,0 L12,1 L10,3 L12,5 Z"}]
    [:path {:d "M5,7 L0,7 L2,9 L0,11 L1,12 L3,10 L5,12 Z"}]])

(defn playback-control-button [playing? events]
  (let [on-click (fn [e]
                   (.preventDefault e)
                   (go (>! events [:toggle-play])))]
    [:span.playback-button {:on-click on-click} [(if playing? pause-icon play-icon)]]))

(defn pad2 [number]
  (if (< number 10) (str "0" number) number))

(defn format-time [seconds]
  (let [m (.floor js/Math (/ seconds 60))
        s (.floor js/Math (mod seconds 60))]
    (str (pad2 m) ":" (pad2 s))))

(defn elapsed-time [current-time]
  (format-time current-time))

(defn remaining-time [current-time total-time]
  (str "-" (format-time (- total-time current-time))))

(defn timer [current-time total-time]
  [:span.timer
    [:span.time-elapsed (elapsed-time current-time)]
    [:span.time-remaining (remaining-time current-time total-time)]])

(defn fullscreen-toggle-button []
  (let [on-click (fn [e]
                   (.preventDefault e)
                   (fullscreen/toggle (-> e .-currentTarget .-parentNode .-parentNode .-parentNode)))]
    [:span.fullscreen-button {:on-click on-click} [expand-icon] [shrink-icon]]))

(defn element-local-mouse-x [e]
  (let [rect (.getBoundingClientRect (.-currentTarget e))]
    (- (.-clientX e) (.-left rect))))

(defn progress-bar [progress events]
  (let [on-mouse-down (fn [e]
                        (.preventDefault e)
                        (let [bar-width (.-offsetWidth (.-currentTarget e))
                              mouse-x (util/adjust-to-range (element-local-mouse-x e) 0 bar-width)
                              position (/ mouse-x bar-width)]
                          (go (>! events [:seek position]))))]
    [:span.progressbar
      [:span.bar {:on-mouse-down on-mouse-down}
        [:span.gutter
          [:span {:style {:width (str (* 100 progress) "%")}}]]]]))

(defn control-bar [playing? current-time total-time events]
  [:div.control-bar
    [playback-control-button playing? events]
    [timer current-time total-time]
    [fullscreen-toggle-button]
    [progress-bar (/ current-time total-time) events]])

(defn start-overlay []
  [:div.start-prompt
    [:div.play-button
      [:div
        [:span
          [logo-play-icon]]]]])

(defn loading-overlay []
  [:div.loading
    [:div.loader]])

(defn player-class-name [theme-name]
  (str "asciinema-theme-" (or theme-name "tango")))

(defn player-style [] {})

(defn handle-event [f events dom-event]
  (when-let [[event-name & _ :as event] (f dom-event)]
    (.preventDefault dom-event)
    (if (= event-name :toggle-fullscreen) ; has to be processed synchronously
      (fullscreen/toggle (.-currentTarget dom-event))
      (go (>! events event)))))

(defn map-key-press [dom-event]
  (case (.-key dom-event)
    " " [:toggle-play]
    "f" [:toggle-fullscreen]
    "0" [:seek 0.0]
    "1" [:seek 0.1]
    "2" [:seek 0.2]
    "3" [:seek 0.3]
    "4" [:seek 0.4]
    "5" [:seek 0.5]
    "6" [:seek 0.6]
    "7" [:seek 0.7]
    "8" [:seek 0.8]
    "9" [:seek 0.9]
    nil))

(defn map-key-down [dom-event]
  (case (.-which dom-event)
    37 [:rewind]
    39 [:fast-forward]
    nil))

(defn player [state events]
  (let [{:keys [font-size theme lines playing current-time duration]} @state
        on-key-press (partial handle-event map-key-press events)
        on-key-down (partial handle-event map-key-down events)
        class-name (player-class-name theme)]
    [:div.asciinema-player-wrapper {:tab-index -1 :on-key-press on-key-press :on-key-down on-key-down}
      [:div.asciinema-player {:class-name class-name :style (player-style)}
        [terminal font-size lines]
        [control-bar playing current-time duration events]
        #_ [start-overlay]]]))
