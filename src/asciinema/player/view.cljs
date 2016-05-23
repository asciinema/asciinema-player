(ns asciinema.player.view
  (:require [clojure.string :as string]
            [reagent.ratom :refer-macros [reaction]]
            [cljs.core.async :refer [chan >! <! put! alts! timeout dropping-buffer pipe]]
            [asciinema.player.messages :as m]
            [asciinema.player.util :as util]
            [asciinema.player.fullscreen :as fullscreen])
  (:require-macros [cljs.core.async.macros :refer [go-loop]]))

(defprotocol TerminalView
  (lines [this])
  (cursor [this]))

(extend-protocol TerminalView
  cljs.core/PersistentArrayMap
  (lines [this]
    (:lines this))
  (cursor [this]
    (:cursor this)))

(defn send-value! [ch f]
  (fn [dom-event]
    (when-let [msg (f dom-event)]
      (put! ch msg)
      (doto dom-event
        .stopPropagation
        .preventDefault))))

(defn send! [ch msg]
  (send-value! ch (fn [_] msg)))

(defn indexed-color? [c]
  (or (number? c)
      (= c "fg")
      (= c "bg")))

(def rgb-color? vector?)

(defn color-class-name [color high-intensity prefix]
  (when (indexed-color? color)
    (let [color (if (and high-intensity (< color 8))
                  (+ color 8)
                  color)]
      (str prefix color))))

(defn part-class-name [{:keys [fg bg bold blink underline inverse cursor]}]
  (let [fg-final (if inverse (or bg "bg") fg)
        bg-final (if inverse (or fg "fg") bg)
        fg-class (color-class-name fg-final bold "fg-")
        bg-class (color-class-name bg-final blink "bg-")
        bold-class (when bold "bright")
        underline-class (when underline "underline")
        cursor-class (when cursor "cursor")
        classes (remove nil? [fg-class bg-class bold-class underline-class cursor-class])]
    (when (seq classes)
      (string/join " " classes))))

(defn css-rgb [[r g b]]
  (str "rgb(" r "," g "," b ")"))

(defn part-style [{:keys [fg bg inverse]}]
  (let [fg-final (if inverse bg fg)
        bg-final (if inverse fg bg)]
    (merge (when (rgb-color? fg-final) {:color (css-rgb fg-final)})
           (when (rgb-color? bg-final) {:background-color (css-rgb bg-final)}))))

(defn part-props [{:keys [inverse cursor] :as attrs}]
  (let [inverse (if cursor (not inverse) inverse)
        attrs (assoc attrs :inverse inverse)
        class-name (part-class-name attrs)
        style (part-style attrs)]
    (merge (when class-name {:class-name class-name})
           (when style {:style style}))))

(def part-props-memoized (memoize part-props))

(defn part [[text attrs] cursor-on]
  (let [attrs (update attrs :cursor #(and % cursor-on))]
    [:span (part-props-memoized attrs) text]))

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

(defn playback-control-button [playing? msg-ch]
  (let [on-click (send! msg-ch (m/->TogglePlay))]
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

(defn click-position [e]
  (let [bar-width (-> e .-currentTarget .-offsetWidth)
        mouse-x (util/adjust-to-range (element-local-mouse-x e) 0 bar-width)]
    (/ mouse-x bar-width)))

(defn progress-bar [progress msg-ch]
  (let [on-mouse-down (send-value! msg-ch (fn [e] (-> e click-position m/->Seek)))
        progress-str (reaction (str (* 100 @progress) "%"))]
    (fn []
      [:span.progressbar
       [:span.bar {:on-mouse-down on-mouse-down}
        [:span.gutter
         [:span {:style {:width @progress-str}}]]]])))

(defn recorded-control-bar [playing? current-time total-time msg-ch]
  (let [progress (reaction (/ @current-time @total-time))]
    (fn []
      [:div.control-bar
       [playback-control-button playing? msg-ch]
       [timer current-time total-time]
       [fullscreen-toggle-button]
       [progress-bar progress msg-ch]])))

(defn stream-control-bar []
  [:div.control-bar.live
   [:span.timer "LIVE"]
   [fullscreen-toggle-button]
   [progress-bar 0 (fn [& _])]])

(defn start-overlay [msg-ch]
  (let [on-click (send! msg-ch (m/->TogglePlay))]
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

(defn key-press->message [dom-event]
  (case (.-key dom-event)
    " " (m/->TogglePlay)
    "f" :toggle-fullscreen
    "0" (m/->Seek 0.0)
    "1" (m/->Seek 0.1)
    "2" (m/->Seek 0.2)
    "3" (m/->Seek 0.3)
    "4" (m/->Seek 0.4)
    "5" (m/->Seek 0.5)
    "6" (m/->Seek 0.6)
    "7" (m/->Seek 0.7)
    "8" (m/->Seek 0.8)
    "9" (m/->Seek 0.9)
    ">" (m/->SpeedUp)
    "<" (m/->SpeedDown)
    nil))

(defn key-down->message [dom-event]
  (case (.-which dom-event)
    37 (m/->Rewind)
    39 (m/->FastForward)
    nil))

(defn handle-key-press [msg-ch dom-event]
  (when-let [msg (key-press->message dom-event)]
    (doto dom-event
      .stopPropagation
      .preventDefault)
    (if (= msg :toggle-fullscreen)
      (fullscreen/toggle (.-currentTarget dom-event))
      (put! msg-ch msg))
    nil))

(defn title-bar [title author author-url author-img-url]
  (let [title-text (if title (str "\"" title "\"") "untitled")]
    [:span.title-bar
     (when author-img-url [:img {:src author-img-url}])
     title-text
     (when author [:span " by " (if author-url [:a {:href author-url} author] author)])]))

(defn activity-chan
  "Converts given channel into an activity indicator channel. The resulting
  channel emits false when there are no reads on input channel within msec, then
  true when new values show up on input, then false again after msec without
  reads on input, and so on."
  ([input msec] (activity-chan input msec (chan)))
  ([input msec output]
   (go-loop []
     ;; wait for activity on input channel
     (<! input)
     (>! output true)

     ;; wait for inactivity on input channel
     (loop []
       (let [t (timeout msec)
             [_ c] (alts! [input t])]
         (when (= c input)
           (recur))))
     (>! output false)

     (recur))
   output))

(defn player [player msg-ch]
  (let [mouse-moves-ch (chan (dropping-buffer 1))
        user-activity-ch (activity-chan mouse-moves-ch 3000 (chan 1 (map m/->ShowHud)))
        on-mouse-move (send! mouse-moves-ch true)
        on-key-press (partial handle-key-press msg-ch)
        on-key-down (send-value! msg-ch key-down->message)
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
    (pipe user-activity-ch msg-ch)
    (fn []
      [:div.asciinema-player-wrapper {:tab-index -1 :on-key-press on-key-press :on-key-down on-key-down :on-mouse-move on-mouse-move :class-name @wrapper-class-name}
       [:div.asciinema-player {:class-name @player-class-name}
        [terminal width height font-size screen cursor-on]
        [recorded-control-bar playing current-time total-time msg-ch]
        (when (or title author) [title-bar title author author-url author-img-url])
        (when-not (or @loading @loaded) [start-overlay msg-ch])
        (when @loading [loading-overlay])]])))
