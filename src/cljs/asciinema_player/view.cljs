(ns asciinema-player.view
  (:require [clojure.string :as string]))

(defn fg-color [fg bold?]
  (if (and fg bold? (< fg 8))
    (+ fg 8)
    fg))

(defn bg-color [bg blink?]
  (if (and bg blink? (< bg 8))
    (+ bg 8)
    bg))

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

(defn terminal [lines]
  [:pre.asciinema-terminal.font-small
   (map (fn [l] [line l]) lines)])

(defn control-bar []
  [:div.controlbar (str "xkaxbar ")])

(defn player-class-name [] "asciinema-theme-solarized-dark")

(defn player-style [] {})

(defn player [state on-click]
  [:div.asciinema-player-wrapper {:tab-index -1}
   [:div.asciinema-player {:class-name (player-class-name) :style (player-style)}
    [terminal (:lines @state)]
    [control-bar]
    ; [overlay]
    ]])
