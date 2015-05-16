(ns asciinema-player.view
  (:require [clojure.string :as string]))

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
        classes (filter identity [fg-class bg-class bold-class underline-class])]
    (string/join " " classes)))

(defn part [p]
  [:span {:class-name (part-class-name (last p))} (first p)])

(defn line [parts]
  [:span.line (map (fn [p] [part p]) parts)])
  ;[:span.line (map (fn [p] ^{:key p} [part p]) parts)])

(defn terminal-class-name [font-size]
  (str "font-" font-size))

(defn terminal [font-size lines]
  [:pre.asciinema-terminal {:class-name (terminal-class-name font-size)}
    (map (fn [l] [line l]) lines)])

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
    [:path {:d "M0,0 L5,0 L3,2 L5,4 L4,5 L2,3 L0,5 Z"}]
    [:path {:d "M12,12 L12,7 L10,9 L8,7 L7,8 L9,10 L7,12 Z"}]])

(defn shrink-icon []
  [:svg {:version "1.1" :xmlns "http://www.w3.org/2000/svg" :view-box "0 0 12 12" :class-name "icon"}
    [:path {:d "M5,5 L5,0 L3,2 L1,0 L0,1 L2,3 L0,5 Z"}]
    [:path {:d "M7,7 L12,7 L10,9 L12,11 L11,12 L9,10 L7,12 Z"}]])

(defn playback-control-button [playing?]
  [:span.playback-button [(if playing? pause-icon play-icon)]])

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

(defn fullscreen-toggle-button [fullscreen?]
  [:span.fullscreen-button [(if fullscreen? shrink-icon expand-icon)]])

(defn progress-bar [progress]
  [:span.progressbar
    [:span.bar
      [:span.gutter
        [:span {:style {:width (str (* 100 progress) "%")}}]]]])

(defn control-bar [playing? fullscreen? current-time total-time]
  [:div.control-bar
    [playback-control-button playing?]
    [timer current-time total-time]
    [fullscreen-toggle-button fullscreen?]
    [progress-bar (/ current-time total-time)]])

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

(defn player [state on-click]
  [:div.asciinema-player-wrapper {:tab-index -1}
   [:div.asciinema-player {:class-name (player-class-name (:theme @state)) :style (player-style)}
    [terminal (:font-size @state) (:lines @state)]
    [control-bar false false 24 32]
    #_ [start-overlay]]])
