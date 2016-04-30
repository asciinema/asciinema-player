(ns asciinema.player.view
  (:require [clojure.string :as string]
            [reagent.ratom :refer-macros [reaction]]
            [asciinema.player.vt :as vt]
            [asciinema.player.util :as util]
            [asciinema.player.fullscreen :as fullscreen]))

(defprotocol TerminalView
  (lines [this])
  (cursor [this]))

(extend-protocol TerminalView
  cljs.core/PersistentArrayMap
  (lines [this]
    (:lines this))
  (cursor [this]
    (:cursor this)))

(extend-protocol TerminalView
  vt/VT
  (lines [this]
    (vt/compact-lines (:lines this)))
  (cursor [this]
    (:cursor this)))

(defn fg-color [fg bold?]
  (if (and fg bold? (< fg 8)) (+ fg 8) fg))

(defn bg-color [bg blink?]
  (if (and bg blink? (< bg 8)) (+ bg 8) bg))

(defn part-class-name [{:keys [fg bg bold blink underline inverse cursor]} cursor-on]
  (let [fg (fg-color fg bold)
        bg (bg-color bg blink)
        inverse (if (and cursor cursor-on) (not inverse) inverse)
        final-fg (if inverse (or bg "bg") fg)
        final-bg (if inverse (or fg "fg") bg)
        fg-class (if final-fg (str "fg-" final-fg))
        bg-class (if final-bg (str "bg-" final-bg))
        bold-class (when bold "bright")
        underline-class (when underline "underline")
        cursor-class (when cursor "cursor")
        classes (remove nil? [fg-class bg-class bold-class underline-class cursor-class])]
    (string/join " " classes)))

(def part-class-name-memoized (memoize part-class-name))

(defn part [[text attrs] cursor-on]
  [:span {:class-name (part-class-name-memoized attrs cursor-on)} text])

(def part-memoized (memoize part))

(defn line [parts cursor-on]
  [:span.line (doall (map-indexed (fn [idx p] ^{:key idx} [part-memoized p @cursor-on]) parts))])

(defn split-part-with-cursor [[text attrs] position]
  (let [left-chars (take position text)
        left-part (if (seq left-chars) [(apply str left-chars) attrs])
        cursor-attrs (assoc attrs :cursor true)
        center-part [(nth text position) cursor-attrs]
        right-chars (drop (inc position) text)
        right-part (if (seq right-chars) [(apply str right-chars) attrs])]
    (remove nil? (vector left-part center-part right-part))))

(defn insert-cursor
  "Marks proper character in line with ':cursor true' by locating and splitting
  a fragment that contains the cursor position."
  [parts cursor-x]
  (loop [left []
         right parts
         idx cursor-x]
    (if (seq right)
      (let [[text attrs :as part] (first right)
            len (count text)]
        (if (<= len idx)
          (recur (conj left part) (rest right) (- idx len))
          (concat left (split-part-with-cursor part idx) (rest right))))
      left)))

(def named-font-sizes #{"small" "medium" "big"})

(defn terminal-class-name [font-size]
  (when (named-font-sizes font-size)
    (str "font-" font-size)))

(defn terminal-style [width height font-size]
  (let [font-size (when-not (named-font-sizes font-size) {:font-size font-size})]
    (merge {:width (str width "ch") :height (str (* 1.3333333333 height) "em")}
           font-size)))

(defn terminal [width height font-size screen cursor-on]
  (let [class-name (reaction (terminal-class-name @font-size))
        style (reaction (terminal-style @width @height @font-size))]
    (fn []
      (let [{cursor-x :x cursor-y :y cursor-visible :visible} (cursor @screen)]
        [:pre.asciinema-terminal
         {:class-name @class-name :style @style}
         (map-indexed (fn [idx parts]
                        (let [cursor-x (when (and cursor-visible (= idx cursor-y)) cursor-x)
                              parts (if cursor-x (insert-cursor parts cursor-x) parts)]
                          ^{:key idx} [line parts cursor-on]))
                      (lines @screen))]))))

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

(defn playback-control-button [playing? dispatch]
  (letfn [(on-click [e]
            (.preventDefault e)
            (dispatch [:toggle-play]))]
    (fn []
      [:span.playback-button {:on-click on-click} [(if @playing? pause-icon play-icon)]])))

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
   [:span.time-elapsed (elapsed-time @current-time)]
   [:span.time-remaining (remaining-time @current-time @total-time)]])

(defn fullscreen-toggle-button []
  (letfn [(on-click [e]
            (.preventDefault e)
            (fullscreen/toggle (-> e .-currentTarget .-parentNode .-parentNode .-parentNode)))]
    (fn []
      [:span.fullscreen-button {:on-click on-click} [expand-icon] [shrink-icon]])))

(defn element-local-mouse-x [e]
  (let [rect (-> e .-currentTarget .getBoundingClientRect)]
    (- (.-clientX e) (.-left rect))))

(defn progress-bar [progress dispatch]
  (let [on-mouse-down (fn [e]
                        (.preventDefault e)
                        (let [bar-width (-> e .-currentTarget .-offsetWidth)
                              mouse-x (util/adjust-to-range (element-local-mouse-x e) 0 bar-width)
                              position (/ mouse-x bar-width)]
                          (dispatch [:seek position])))
        progress-str (reaction (str (* 100 @progress) "%"))]
    (fn []
      [:span.progressbar
       [:span.bar {:on-mouse-down on-mouse-down}
        [:span.gutter
         [:span {:style {:width @progress-str}}]]]])))

(defn recorded-control-bar [playing? current-time total-time dispatch]
  (let [progress (reaction (/ @current-time @total-time))]
    (fn []
      [:div.control-bar
       [playback-control-button playing? dispatch]
       [timer current-time total-time]
       [fullscreen-toggle-button]
       [progress-bar progress dispatch]])))

(defn stream-control-bar []
  [:div.control-bar.live
   [:span.timer "LIVE"]
   [fullscreen-toggle-button]
   [progress-bar 0 (fn [& _])]])

(defn start-overlay [dispatch]
  (letfn [(on-click [e]
            (.preventDefault e)
            (dispatch [:toggle-play]))]
    (fn []
      [:div.start-prompt {:on-click on-click}
       [:div.play-button
        [:div
         [:span
          [logo-play-icon]]]]])))

(defn loading-overlay []
  [:div.loading
   [:div.loader]])

(defn player-class-name [theme-name]
  (str "asciinema-theme-" theme-name))

(defn handle-dom-event [dispatch event-mapper dom-event]
  (when-let [[event-name & _ :as event] (event-mapper dom-event)]
    (.preventDefault dom-event)
    (if (= event-name :toggle-fullscreen) ; has to be processed synchronously
      (fullscreen/toggle (.-currentTarget dom-event))
      (dispatch event))))

(defn key-press->event [dom-event]
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
    ">" [:speed-up]
    "<" [:speed-down]
    nil))

(defn key-down->event [dom-event]
  (case (.-which dom-event)
    37 [:rewind]
    39 [:fast-forward]
    nil))

(defn title-bar [title author author-url author-img-url]
  (let [title-text (if title (str "\"" title "\"") "untitled")]
    [:span.title-bar
     (when author-img-url [:img {:src author-img-url}])
     title-text
     (when author [:span " by " (if author-url [:a {:href author-url} author] author)])]))

(defn player [player dispatch]
  (let [on-key-press (partial handle-dom-event dispatch key-press->event)
        on-key-down (partial handle-dom-event dispatch key-down->event)
        on-mouse-move #(dispatch [:mouse-move])
        wrapper-class-name (reaction (when (:show-hud @player) "hud"))
        player-class-name (reaction (player-class-name (:theme @player)))
        width (reaction (or (:width @player) 80))
        height (reaction (or (:height @player) 24))
        font-size (reaction (:font-size @player))
        screen (reaction (:screen @player))
        cursor-on (reaction (:cursor-on @player))
        playing (reaction (:playing @player))
        current-time (reaction (:current-time @player))
        total-time (reaction (:duration @player))
        loading (reaction (:loading @player))
        loaded (reaction (:loaded @player))
        {:keys [title author author-url author-img-url]} @player]
    (fn []
      [:div.asciinema-player-wrapper {:tab-index -1 :on-key-press on-key-press :on-key-down on-key-down :on-mouse-move on-mouse-move :class-name @wrapper-class-name}
       [:div.asciinema-player {:class-name @player-class-name}
        [terminal width height font-size screen cursor-on]
        [recorded-control-bar playing current-time total-time dispatch]
        (when (or title author) [title-bar title author author-url author-img-url])
        (when-not (or @loading @loaded) [start-overlay dispatch])
        (when @loading [loading-overlay])]])))
