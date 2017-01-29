(ns asciinema.vt.screen
  (:refer-clojure :exclude [print])
  (:require [asciinema.player.util :as util]
            [schema.core :as s #?@(:cljs [:include-macros true])]))

(def Tabs #?(:clj clojure.lang.PersistentTreeSet :cljs cljs.core/PersistentTreeSet))

(def Charset (s/pred ifn?))

(def Cursor {:x s/Num
             :y s/Num
             :visible s/Bool})

(def CodePoint s/Num)

(def Color (s/if vector?
             [(s/one s/Num "r") (s/one s/Num "g") (s/one s/Num "b")]
             s/Num))

(def CharAttrs {(s/optional-key :fg) Color
                (s/optional-key :bg) Color
                (s/optional-key :bold) s/Bool
                (s/optional-key :italic) s/Bool
                (s/optional-key :underline) s/Bool
                (s/optional-key :blink) s/Bool
                (s/optional-key :inverse) s/Bool})

(def SavedCursor {:cursor {:x s/Num :y s/Num}
                  :char-attrs CharAttrs
                  :origin-mode s/Bool
                  :auto-wrap-mode s/Bool})

(def Cell [(s/one CodePoint "unicode codepoint") (s/one CharAttrs "text attributes")])

(def CellLine [Cell])

(s/defrecord Screen
    [width :- s/Num
     height :- s/Num
     top-margin :- s/Num
     bottom-margin :- s/Num
     tabs :- Tabs
     cursor :- Cursor
     char-attrs :- CharAttrs
     charset-fn :- Charset
     insert-mode :- s/Bool
     auto-wrap-mode :- s/Bool
     new-line-mode :- s/Bool
     next-print-wraps :- s/Bool
     origin-mode :- s/Bool
     buffer :- s/Keyword
     lines :- [CellLine]
     saved :- SavedCursor
     other-buffer-lines :- (s/maybe [CellLine])
     other-buffer-saved :- SavedCursor])

;; field accessors

(def width :width)
(def height :height)
(def char-attrs :char-attrs)
(def next-print-wraps? :next-print-wraps)
(def origin-mode? :origin-mode)
(def auto-wrap-mode? :auto-wrap-mode)
(def insert-mode? :insert-mode)
(def new-line-mode? :new-line-mode)

(def space 0x20)

(def normal-char-attrs {})

(s/defn cell :- Cell
  [ch :- CodePoint
   char-attrs :- CharAttrs]
  (vector ch char-attrs))

(s/defn blank-cell :- Cell
  [char-attrs]
  (cell space char-attrs))

(s/defn blank-line :- CellLine
  ([width] (blank-line width normal-char-attrs))
  ([width char-attrs]
   (vec (repeat width (blank-cell char-attrs)))))

(s/defn blank-buffer :- [CellLine]
  ([width height] (blank-buffer width height normal-char-attrs))
  ([width height char-attrs]
   (let [line (blank-line width char-attrs)]
     (vec (repeat height line)))))

(s/defn default-tabs :- Tabs
  [width]
  (apply sorted-set (range 8 width 8)))

(def initial-cursor {:x 0
                     :y 0
                     :visible true})

(def initial-saved-cursor {:cursor {:x 0 :y 0}
                           :char-attrs normal-char-attrs
                           :origin-mode false
                           :auto-wrap-mode true})

(def default-charset identity)

(def special-charset {96  9830, 97  9618, 98  9225, 99  9228,
                      100 9229, 101 9226, 102 176,  103 177,
                      104 9252, 105 9227, 106 9496, 107 9488,
                      108 9484, 109 9492, 110 9532, 111 9146,
                      112 9147, 113 9472, 114 9148, 115 9149,
                      116 9500, 117 9508, 118 9524, 119 9516,
                      120 9474, 121 8804, 122 8805, 123 960,
                      124 8800, 125 163,  126 8901})

(s/defn blank-screen :- Screen
  [width :- s/Num
   height :- s/Num]
  (map->Screen {:width width
                :height height
                :top-margin 0
                :bottom-margin (dec height)
                :tabs (default-tabs width)
                :cursor initial-cursor
                :char-attrs normal-char-attrs
                :charset-fn default-charset
                :insert-mode false
                :auto-wrap-mode true
                :new-line-mode false
                :next-print-wraps false
                :origin-mode false
                :buffer :primary
                :lines (blank-buffer width height)
                :saved initial-saved-cursor
                :other-buffer-lines nil
                :other-buffer-saved initial-saved-cursor}))

;; modes

(defn enable-insert-mode [screen]
  (assoc screen :insert-mode true))

(defn disable-insert-mode [screen]
  (assoc screen :insert-mode false))

(defn enable-new-line-mode [screen]
  (assoc screen :new-line-mode true))

(defn disable-new-line-mode [screen]
  (assoc screen :new-line-mode false))

(defn enable-origin-mode [screen]
  (assoc screen :origin-mode true))

(defn disable-origin-mode [screen]
  (assoc screen :origin-mode false))

(defn enable-auto-wrap-mode [screen]
  (assoc screen :auto-wrap-mode true))

(defn disable-auto-wrap-mode [screen]
  (assoc screen :auto-wrap-mode false))

;; char attrs

(defn reset-char-attrs [screen]
  (assoc screen :char-attrs normal-char-attrs))

(defn set-attr [screen attr-name value]
  (assoc-in screen [:char-attrs attr-name] value))

(defn unset-attr [screen attr-name]
  (update screen :char-attrs dissoc attr-name))

;; scrolling

(defn- scroll-up-lines [lines n filler]
  (let [n (min n (count lines))]
    (concat
     (drop n lines)
     (repeat n filler))))

(defn scroll-up
  ([screen] (scroll-up screen 1))
  ([{:keys [width top-margin bottom-margin char-attrs] :as screen} n]
   (let [filler (blank-line width char-attrs)]
     (update screen :lines (fn [lines]
                             (vec (concat
                                   (take top-margin lines)
                                   (scroll-up-lines (subvec lines top-margin (inc bottom-margin)) n filler)
                                   (drop (inc bottom-margin) lines))))))))

(defn- scroll-down-lines [lines n filler]
  (let [height (count lines)
        n (min n height)]
    (concat
     (repeat n filler)
     (take (- height n) lines))))

(defn scroll-down
  ([screen] (scroll-down screen 1))
  ([{:keys [width top-margin bottom-margin char-attrs] :as screen} n]
   (let [filler (blank-line width char-attrs)]
     (update screen :lines (fn [lines]
                             (vec (concat
                                   (take top-margin lines)
                                   (scroll-down-lines (subvec lines top-margin (inc bottom-margin)) n filler)
                                   (drop (inc bottom-margin) lines))))))))

;; cursor

(defn cursor [screen]
  (:cursor screen))

(defn saved [screen]
  (:saved screen))

(defn show-cursor [screen]
  (assoc-in screen [:cursor :visible] true))

(defn hide-cursor [screen]
  (assoc-in screen [:cursor :visible] false))

(defn move-cursor-to-col! [screen x]
  (-> screen
      (assoc-in [:cursor :x] x)
      (assoc :next-print-wraps false)))

(defn move-cursor-to-col [{width :width :as screen} x]
  (move-cursor-to-col! screen (-> x (max 0) (min (dec width)))))

(defn move-cursor-to-row! [{:keys [width] {:keys [x]} :cursor :as screen} y]
  (-> screen
      (assoc-in [:cursor :x] (min x (dec width)))
      (assoc-in [:cursor :y] y)
      (assoc :next-print-wraps false)))

(defn top-margin [{:keys [origin-mode top-margin] :as screen}]
  (if origin-mode top-margin 0))

(defn bottom-margin [{:keys [origin-mode bottom-margin height] :as screen}]
  (if origin-mode bottom-margin (dec height)))

(defn- adjust-y-to-margins [screen y]
  (let [top (top-margin screen)
        bottom (bottom-margin screen)]
    (util/adjust-to-range (+ top y) top bottom)))

(defn move-cursor-to-row-within-margins [screen y]
  (move-cursor-to-row! screen (adjust-y-to-margins screen y)))

(defn move-cursor-to-home [screen]
  (-> screen
      (move-cursor-to-col! 0)
      (move-cursor-to-row! (top-margin screen))))

(defn move-cursor [screen x y]
  (-> screen
      (move-cursor-to-col x)
      (move-cursor-to-row-within-margins y)))

(defn- move-cursor-down [{:keys [bottom-margin height] {y :y} :cursor :as screen}]
  (let [last-row (dec height)]
    (cond (= y bottom-margin) (scroll-up screen)
          (< y last-row) (move-cursor-to-row! screen (inc y))
          :else screen)))

(defn move-cursor-left [{{x :x} :cursor :as screen}]
  (move-cursor-to-col screen (dec x)))

(defn cursor-up [{:keys [top-margin] {:keys [y]} :cursor :as screen} n]
  (let [new-y (if (< y top-margin)
                (max 0 (- y n))
                (max top-margin (- y n)))]
    (move-cursor-to-row! screen new-y)))

(defn cursor-down [{{y :y} :cursor :keys [bottom-margin height] :as screen} n]
  (let [new-y (if (> y bottom-margin)
                (min (dec height) (+ y n))
                (min bottom-margin (+ y n)))]
    (move-cursor-to-row! screen new-y)))

(defn cursor-forward [{{x :x} :cursor :as screen} n]
  (move-cursor-to-col screen (+ x n)))

(defn cursor-backward [{{x :x} :cursor :as screen} n]
  (move-cursor-to-col screen (- x n)))

(defn line-feed [{:keys [new-line-mode] :as screen}]
  (let [screen (move-cursor-down screen)]
    (if new-line-mode
      (move-cursor-to-col! screen 0)
      screen)))

(defn new-line [screen]
  (-> screen
      move-cursor-down
      (move-cursor-to-col! 0)))

(defn reverse-index [{:keys [top-margin] {y :y} :cursor :as screen}]
  (cond (= y top-margin) (scroll-down screen)
        (> y 0) (move-cursor-to-row! screen (dec y))
        :else screen))

(defn save-cursor [{{:keys [x y]} :cursor :keys [char-attrs origin-mode auto-wrap-mode] :as screen}]
  (assoc screen :saved {:cursor {:x x :y y}
                        :char-attrs char-attrs
                        :origin-mode origin-mode
                        :auto-wrap-mode auto-wrap-mode}))

(defn restore-cursor [{{:keys [cursor char-attrs origin-mode auto-wrap-mode]} :saved :as screen}]
  (-> screen
      (assoc :char-attrs char-attrs
             :next-print-wraps false
             :origin-mode origin-mode
             :auto-wrap-mode auto-wrap-mode)
      (update :cursor merge cursor)))

(defn reset-saved-cursor [screen]
  (assoc screen :saved initial-saved-cursor))

;; margins

(defn set-margins [{:keys [height] :as screen} top bottom]
  (let [bottom (or bottom (dec height))]
    (if (< -1 top bottom height)
      (assoc screen :top-margin top :bottom-margin bottom)
      screen)))

(defn reset-margins [{:keys [height] :as screen}]
  (assoc screen :top-margin 0 :bottom-margin (dec height)))

;; buffers

(defn switch-to-alternate-buffer [{:keys [buffer width height char-attrs] :as screen}]
  (if (= buffer :primary)
    (assoc screen
           :buffer :alternate
           :other-buffer-lines (:lines screen)
           :other-buffer-saved (:saved screen)
           :lines (blank-buffer width height char-attrs)
           :saved (:other-buffer-saved screen))
    screen))

(defn switch-to-primary-buffer [{:keys [buffer] :as screen}]
  (if (= buffer :alternate)
    (assoc screen
           :buffer :primary
           :other-buffer-lines nil
           :other-buffer-saved (:saved screen)
           :lines (:other-buffer-lines screen)
           :saved (:other-buffer-saved screen))
    screen))

;; tabs

(defn set-horizontal-tab [{{:keys [x]} :cursor :keys [width] :as screen}]
  (if (< 0 x width)
    (update screen :tabs conj x)
    screen))

(defn clear-horizontal-tab [{{:keys [x]} :cursor :as screen}]
  (update screen :tabs disj x))

(defn clear-all-horizontal-tabs [screen]
  (update screen :tabs empty))

(defn move-cursor-to-next-tab [{{:keys [x]} :cursor :keys [tabs width] :as screen} n]
  (let [n (dec n)
        right-margin (dec width)
        next-tabs (drop-while #(>= x %) tabs)
        new-x (nth next-tabs n right-margin)]
    (move-cursor-to-col screen new-x)))

(defn move-cursor-to-prev-tab [{{:keys [x]} :cursor :keys [tabs width] :as screen} n]
  (let [n (dec n)
        prev-tabs (take-while #(> x %) tabs)
        new-x (nth (reverse prev-tabs) n 0)]
    (move-cursor-to-col screen new-x)))

;; charsets

(defn set-default-charset [screen]
  (assoc screen :charset-fn default-charset))

(defn set-special-charset [screen]
  (assoc screen :charset-fn special-charset))

;; printing

(defn- replace-char [line x cell]
  (assoc line x cell))

(defn- insert-char [line x cell]
  (vec (concat
        (take x line)
        [cell]
        (take (- (count line) x 1) (drop x line)))))

(defn- wrap [{{:keys [y]} :cursor :keys [height] :as screen}]
  (let [screen (move-cursor-to-col! screen 0)]
    (if (= height (inc y))
      (scroll-up screen)
      (move-cursor-to-row! screen (inc y)))))

(defn- do-print [{:keys [width height char-attrs auto-wrap-mode insert-mode charset-fn] {:keys [x y]} :cursor :as screen} input]
  (let [input (if (< 95 input 127) (charset-fn input) input)
        cell (cell input char-attrs)]
    (if (= width (inc x))
      (if auto-wrap-mode
        (-> screen
            (assoc-in [:lines y x] cell)
            (move-cursor-to-col! (inc x))
            (assoc :next-print-wraps true))
        (-> screen
            (assoc-in [:lines y x] cell)))
      (let [f (if insert-mode insert-char replace-char)]
        (-> screen
            (update-in [:lines y] f x cell)
            (move-cursor-to-col! (inc x)))))))

(defn print [{:keys [auto-wrap-mode next-print-wraps] :as screen} input]
  (if (and auto-wrap-mode next-print-wraps)
    (do-print (wrap screen) input)
    (do-print screen input)))

(defn test-pattern [{:keys [width height] :as screen}]
  (assoc screen :lines (vec (repeat height (vec (repeat width [0x45 normal-char-attrs]))))))

;; clearing/erasing

(defn clear-line [{{y :y} :cursor :keys [width char-attrs] :as screen}]
  (assoc-in screen [:lines y] (blank-line width char-attrs)))

(defn- clear-line-right [line x char-attrs]
  (vec (concat (take x line)
               (repeat (- (count line) x) (blank-cell char-attrs)))))

(defn- clear-line-left [line x char-attrs]
  (vec (concat (repeat (inc x) (blank-cell char-attrs))
               (drop (inc x) line))))

(defn clear-to-end-of-line [{{x :x y :y} :cursor :keys [width char-attrs] :as screen}]
  (let [x (min x (dec width))]
    (update-in screen [:lines y] clear-line-right x char-attrs)))

(defn clear-to-beginning-of-line [{{x :x y :y} :cursor :keys [width char-attrs] :as screen}]
  (let [x (min x (dec width))]
    (update-in screen [:lines y] clear-line-left x char-attrs)))

(defn clear-screen [{:keys [width height char-attrs] :as screen}]
  (assoc screen :lines (blank-buffer width height char-attrs)))

(defn clear-to-end-of-screen [{{:keys [x y]} :cursor :keys [width height char-attrs] :as screen}]
  (update screen :lines (fn [lines]
                          (let [top-lines (take y lines)
                                curr-line (clear-line-right (nth lines y) x char-attrs)
                                bottom-lines (repeat (- height y 1) (blank-line width char-attrs))]
                            (vec (concat top-lines [curr-line] bottom-lines))))))

(defn clear-to-beginning-of-screen [{{:keys [x y]} :cursor :keys [width height char-attrs] :as screen}]
  (let [x (min x (dec width))]
    (update screen :lines (fn [lines]
                            (let [top-lines (repeat y (blank-line width char-attrs))
                                  curr-line (clear-line-left (nth lines y) x char-attrs)
                                  bottom-lines (drop (inc y) lines)]
                              (vec (concat top-lines [curr-line] bottom-lines)))))))

(defn erase-characters [{{:keys [x y]} :cursor :keys [width char-attrs] :as screen} n]
  (let [n (min n (- width x))]
    (update-in screen [:lines y] (fn [line]
                                   (vec (concat
                                         (take x line)
                                         (repeat n (blank-cell char-attrs))
                                         (drop (+ x n) line)))))))

;; inserting

(defn insert-characters [{{:keys [x y]} :cursor :keys [width char-attrs] :as screen} n]
  (update-in screen [:lines y] (fn [line]
                                 (vec (take width (concat (take x line)
                                                          (repeat n [space char-attrs])
                                                          (drop x line)))))))

(defn insert-lines [{:keys [bottom-margin width height char-attrs] {y :y} :cursor :as screen} n]
  (let [filler (blank-line width char-attrs)]
    (update screen :lines (fn [lines]
                            (vec (if (<= y bottom-margin)
                                   (concat
                                    (take y lines)
                                    (scroll-down-lines (subvec lines y (inc bottom-margin)) n filler)
                                    (drop (inc bottom-margin) lines))
                                   (concat
                                    (take y lines)
                                    (scroll-down-lines (drop y lines) n filler))))))))

;; deleting

(defn delete-lines [{:keys [bottom-margin width height char-attrs] {y :y} :cursor :as screen} n]
  (let [filler (blank-line width char-attrs)]
    (update screen :lines (fn [lines]
                            (vec (if (<= y bottom-margin)
                                   (concat
                                    (take y lines)
                                    (scroll-up-lines (subvec lines y (inc bottom-margin)) n filler)
                                    (drop (inc bottom-margin) lines))
                                   (concat
                                    (take y lines)
                                    (scroll-up-lines (drop y lines) n filler))))))))

(defn delete-characters [{{:keys [x y]} :cursor :keys [width char-attrs] :as screen} n]
  (let [screen (if (>= x width) (move-cursor-to-col screen (dec width)) screen)
        x (get-in screen [:cursor :x])
        n (min n (- width x))]
    (update-in screen [:lines y] (fn [line]
                                   (vec (concat
                                         (take x line)
                                         (drop (+ x n) line)
                                         (repeat n (blank-cell char-attrs))))))))

;; lines

(s/defn chars->string :- s/Str
  [chars :- [CodePoint]]
  #?(:clj (String. (int-array chars) 0 (count chars))
     :cljs (apply js/String.fromCodePoint chars)))

(def Fragment [(s/one s/Str "text") (s/one CharAttrs "text attributes")])

(def FragmentLine [Fragment])

(s/defn compact-line :- FragmentLine
  "Joins together all neighbouring cells having the same color attributes,
  converting unicode codepoints to strings."
  [line :- CellLine]
  (let [[cell & cells] line]
    (loop [segments []
           chars [(first cell)]
           attrs (last cell)
           cells cells]
      (if-let [[char new-attrs] (first cells)]
        (if (= new-attrs attrs)
          (recur segments (conj chars char) attrs (rest cells))
          (recur (conj segments [(chars->string chars) attrs]) [char] new-attrs (rest cells)))
        (conj segments [(chars->string chars) attrs])))))

(defn compact-lines [lines]
  (map compact-line lines))

(defn lines [screen]
  (-> screen :lines compact-lines))

;; resetting

(defn soft-reset [screen]
  (-> screen
      show-cursor
      reset-margins
      disable-insert-mode
      disable-origin-mode
      reset-char-attrs
      reset-saved-cursor))
