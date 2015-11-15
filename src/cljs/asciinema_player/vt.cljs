(ns asciinema-player.vt
  (:refer-clojure :exclude [print])
  (:require [clojure.string :as string]))

;; References:
;; http://vt100.net/emu/dec_ansi_parser
;; http://en.wikipedia.org/wiki/ANSI_escape_code
;; http://ttssh2.sourceforge.jp/manual/en/about/ctrlseq.html
;; http://real-world-systems.com/docs/ANSIcode.html
;; http://www.shaels.net/index.php/propterm/documents
;; http://manpages.ubuntu.com/manpages/lucid/man7/urxvt.7.html
;; http://vt100.net/docs/vt102-ug/chapter5.html

(def space 0x20)
(def default-attrs {})
(def empty-cell [space default-attrs])

(defn empty-line [width]
  (vec (repeat width empty-cell)))

(defn empty-screen [width height]
  (let [line (empty-line width)]
    (vec (repeat height line))))

(defn default-tabs [width]
  (apply sorted-set (range 8 width 8)))

(defn make-vt [width height]
  {:width width
   :height height
   :parser {:state :ground
            :intermediate-chars []
            :param-chars []}
   :tabs (default-tabs width)
   :cursor {:x 0 :y 0 :visible true}
   :char-attrs {}
   :lines (empty-screen width height)
   :saved {:cursor {:x 0 :y 0} :char-attrs {}}})

;; control functions

(defn scroll-up [{width :width :as vt}]
  (update-in vt [:lines] (fn [lines]
                           (conj (vec (drop 1 lines)) (empty-line width)))))

(defn scroll-down [{width :width height :height :as vt}]
  (update-in vt [:lines] (fn [lines]
                           (vec (conj (take (dec height) lines) (empty-line width))))))

(defn execute-bs [vt]
  (update-in vt [:cursor :x] (fn [x]
                               (if (pos? x) (dec x) x))))

(defn execute-ht [vt]
  (update-in vt [:cursor :x] (fn [x]
                               (let [next-tab (first (filter (partial < x) (:tabs vt)))]
                                 (or next-tab x)))))

(defn execute-lf [{height :height {y :y} :cursor :as vt}]
  (if (= height (inc y))
    (-> vt
        scroll-up
        (assoc-in [:cursor :x] 0))
    (-> vt
        (assoc-in [:cursor :x] 0)
        (update-in [:cursor :y] inc))))

(defn move-cursor-down [{height :height {y :y} :cursor :as vt}]
  (if (= height (inc y))
    (scroll-up vt)
    (update-in vt [:cursor :y] inc)))

(def execute-vt move-cursor-down)
(def execute-ff move-cursor-down)

(defn execute-cr [vt]
  (assoc-in vt [:cursor :x] 0))

(def execute-ind move-cursor-down)
(def execute-nel execute-lf)

(defn execute-hts [{{x :x} :cursor :as vt}]
  (if (pos? x)
    (update-in vt [:tabs] conj x)
    vt))

(defn execute-ri [{{y :y} :cursor :as vt}]
  (if (zero? y)
    (scroll-down vt)
    (update-in vt [:cursor :y] dec)))

(defn execute-decaln [{:keys [width height] :as vt}]
  (assoc vt :lines (vec (repeat height (vec (repeat width [0x45 {}]))))))

(defn execute-sc
  "http://www.vt100.net/docs/vt510-rm/DECSC"
  [{{x :x y :y} :cursor char-attrs :char-attrs :as vt}]
  (assoc vt :saved {:cursor {:x x :y y}
                    :char-attrs char-attrs}))

(defn execute-rc
  "http://www.vt100.net/docs/vt510-rm/DECRC"
  [{saved :saved :as vt}]
  (merge-with merge vt saved))

(defn split-coll [elem coll]
  (loop [coll coll
         parts []
         part []]
    (if-let [e (first coll)]
      (if (= e elem)
        (recur (rest coll) (conj parts part) [])
        (recur (rest coll) parts (conj part e)))
      (if (seq part)
        (conj parts part)
        parts))))

(defn reduce-param [chars]
  (let [digits (map #(- % 0x30) chars)
        components (map * (reverse digits) (iterate (partial * 10) 1))]
  (reduce + 0 components)))

(defn get-params [vt]
  (let [chars (get-in vt [:parser :param-chars])
        groups (split-coll 0x3b chars)]
    (map reduce-param groups)))

(defn get-param [vt n default]
  (let [v (nth (get-params vt) n 0)]
    (if (zero? v)
      default
      v)))

(defn execute-ich [{{x :x y :y} :cursor width :width char-attrs :char-attrs :as vt}]
  (let [n (get-param vt 0 1)]
    (update-in vt [:lines y] (fn [line]
                               (vec (take width (concat (take x line)
                                                        (repeat n [space char-attrs])
                                                        (drop x line))))))))

(defn execute-cuu [{{y :y} :cursor :as vt}]
  (let [n (get-param vt 0 1)
        new-y (- y n)
        new-y (if (>= new-y 0) new-y 0)]
    (assoc-in vt [:cursor :y] new-y)))

(defn execute-cud [{{y :y} :cursor height :height :as vt}]
  (let [n (get-param vt 0 1)
        new-y (+ y n)
        new-y (if (< new-y height) new-y (dec height))]
    (assoc-in vt [:cursor :y] new-y)))

(defn execute-cuf [{{x :x} :cursor width :width :as vt}]
  (let [n (get-param vt 0 1)
        new-x (+ x n)
        new-x (if (< new-x width) new-x (dec width))]
    (assoc-in vt [:cursor :x] new-x)))

(defn execute-cub [{{x :x} :cursor width :width :as vt}]
  (let [n (get-param vt 0 1)
        new-x (- x n)
        new-x (if (>= new-x 0) new-x 0)]
    (assoc-in vt [:cursor :x] new-x)))

(defn execute-cnl [vt]
  (-> vt
      execute-cud
      (assoc-in [:cursor :x] 0)))

(defn execute-cpl [vt]
  (-> vt
      execute-cuu
      (assoc-in [:cursor :x] 0)))

(defn execute-cha [{width :width :as vt}]
  (let [n (get-param vt 0 1)
        new-x (if (<= n width) (dec n) (dec width))]
    (assoc-in vt [:cursor :x] new-x)))

(defn execute-cup [{width :width height :height :as vt}]
  (let [new-x (get-param vt 1 1)
        new-x (if (<= new-x width) (dec new-x) (dec width))
        new-y (get-param vt 0 1)
        new-y (if (<= new-y height) (dec new-y) (dec height))]
    (-> vt
        (assoc-in [:cursor :x] new-x)
        (assoc-in [:cursor :y] new-y))))

;; parser actions

(defn ignore [vt input]
  vt)

(defn print [{width :width height :height {x :x y :y} :cursor :as vt} input]
  (if (= width (inc x))
    (if (= height (inc y))
      (-> vt
          (assoc-in [:lines y x 0] input)
          (assoc-in [:cursor :x] 0)
          scroll-up)
      (-> vt
          (assoc-in [:lines y x 0] input)
          (assoc-in [:cursor :x] 0)
          (update-in [:cursor :y] inc)))
    (-> vt
        (assoc-in [:lines y x 0] input)
        (update-in [:cursor :x] inc))))

(defn execute [vt input]
  (if-let [action (condp = input
                    0x08 execute-bs
                    0x09 execute-ht
                    0x0a execute-lf
                    0x0b execute-vt
                    0x0c execute-ff
                    0x0d execute-cr
                    0x84 execute-ind
                    0x85 execute-nel
                    0x88 execute-hts
                    0x8d execute-ri
                    nil)]
    (action vt)
    vt))

(defn clear [vt input]
  (update-in vt [:parser] merge {:intermediate-chars [] :param-chars []}))

(defn collect [vt input]
  (update-in vt [:parser :intermediate-chars] conj input))

(defn param [vt input]
  (update-in vt [:parser :param-chars] conj input))

(defn esc-dispatch [vt input]
  (if (<= 0x40 input 0x5f)
    (execute vt (+ input 0x40))
    (condp = input
      0x37 (execute-sc vt)
      0x38 (condp = (get-in vt [:parser :intermediate-chars])
             [] (execute-rc vt)
             [0x23] (execute-decaln vt)
             vt)
      0x63 (make-vt (:width vt) (:height vt))
      vt)))

(defn csi-dispatch [vt input]
  (if-let [action (condp = input
                    0x40 execute-ich
                    0x41 execute-cuu
                    0x42 execute-cud
                    0x43 execute-cuf
                    0x44 execute-cub
                    0x45 execute-cnl
                    0x46 execute-cpl
                    0x47 execute-cha
                    0x48 execute-cup
                    nil)]
    (action vt)
    vt))

(defn hook [vt input]
  vt)

(defn put [vt input]
  vt)

(defn unhook [vt input]
  vt)

(defn osc-start [vt input]
  vt)

(defn osc-put [vt input]
  vt)

(defn osc-end [vt input]
  vt)

;; end actions

(defn- event-seq [event]
  (if (keyword? event)
    (let [[low high] (string/split (name event) "-")
          low (js/parseInt low 16)
          high (js/parseInt high 16)]
      (range low (inc high)))
    [event]))

(defn- events [& items]
  (set (mapcat event-seq items)))

(def c0-prime? (events :0x00-0x17 0x19 :0x1C-0x1F))

(def anywhere-state {(events 0x18 0x1A :0x80-0x8F :0x91-0x97 0x99 0x9A) {:action execute, :transition :ground}
                     (events 0x9C) {:transition :ground}
                     (events 0x1B) {:transition :escape}
                     (events 0x98 0x9E 0x9F) {:transition :sos-pm-apc-string}
                     (events 0x90) {:transition :dcs-entry}
                     (events 0x9D) {:transition :osc-string}
                     (events 0x9B) {:transition :csi-entry}})

(def states {
  :ground {
    c0-prime? {:action execute}
    (events :0x20-0x7F :0xA0-0xFF) {:action print}
  }
  :escape {
    :on-enter clear
    c0-prime? {:action execute}
    (events :0x20-0x2F) {:action collect, :transition :escape-intermediate}
    (events :0x30-0x4F :0x51-0x57 0x59 0x5A 0x5C :0x60-0x7E) {:action esc-dispatch, :transition :ground}
    (events 0x5B) {:transition :csi-entry}
    (events 0x5D) {:transition :osc-string}
    (events 0x50) {:transition :dcs-entry}
    (events 0x58 0x5E 0x5F) {:transition :sos-pm-apc-string}
    (events 0x7f) {:action ignore}
  }
  :escape-intermediate {
    c0-prime? {:action execute}
    (events :0x20-0x2F) {:action collect}
    (events :0x30-0x7E) {:action esc-dispatch, :transition :ground}
    (events 0x7f) {:action ignore}
  }
  :csi-entry {
    :on-enter clear
    c0-prime? {:action execute}
    (events :0x40-0x7E) {:action csi-dispatch, :transition :ground}
    (events :0x30-0x39 0x3B) {:action param, :transition :csi-param}
    (events :0x3C-0x3F) {:action collect, :transition :csi-param}
    (events 0x3A) {:transition :csi-ignore}
    (events :0x20-0x2F) {:action collect, :transition :csi-intermediate}
    (events 0x7f) {:action ignore}
  }
  :csi-param {
    c0-prime? {:action execute}
    (events :0x30-0x39 0x3B) {:action param}
    (events 0x3A :0x3C-0x3F) {:transition :csi-ignore}
    (events :0x20-0x2F) {:action collect, :transition :csi-intermediate}
    (events :0x40-0x7E) {:action csi-dispatch, :transition :ground}
    (events 0x7f) {:action ignore}
  }
  :csi-intermediate {
    c0-prime? {:action execute}
    (events :0x20-0x2F) {:action collect}
    (events :0x40-0x7E) {:action csi-dispatch, :transition :ground}
    (events :0x30-0x3F) {:transition :csi-ignore}
    (events 0x7f) {:action ignore}
  }
  :csi-ignore {
    c0-prime? {:action execute}
    (events :0x20-0x3F) {:action ignore}
    (events :0x40-0x7E) {:transition :ground}
    (events 0x7f) {:action ignore}
  }
  :dcs-entry {
    :on-enter clear
    c0-prime? {:action ignore}
    (events :0x20-0x2F) {:action collect, :transition :dcs-intermediate}
    (events 0x3A) {:transition :dcs-ignore}
    (events :0x30-0x39 0x3B) {:action param, :transition :dcs-param}
    (events :0x3C-0x3F) {:action collect, :transition :dcs-param}
    (events :0x40-0x7E) {:transition :dcs-passthrough}
    (events 0x7f) {:action ignore}
  }
  :dcs-param {
    c0-prime? {:action ignore}
    (events :0x20-0x2F) {:action collect, :transition :dcs-intermediate}
    (events :0x30-0x39 0x3B) {:action param}
    (events 0x3A :0x3C-0x3F) {:transition :dcs-ignore}
    (events :0x40-0x7E) {:transition :dcs-passthrough}
    (events 0x7f) {:action ignore}
  }
  :dcs-intermediate {
    c0-prime? {:action ignore}
    (events :0x20-0x2F) {:action collect}
    (events :0x30-0x3F) {:transition :dcs-ignore}
    (events :0x40-0x7E) {:transition :dcs-passthrough}
    (events 0x7f) {:action ignore}
  }
  :dcs-passthrough {
    :on-enter hook
    c0-prime? {:action put}
    (events :0x20-0x7E) {:action put}
    (events 0x7f) {:action ignore}
    :on-exit unhook
  }
  :dcs-ignore {
    c0-prime? {:action ignore}
    (events :0x20-0x7f) {:action ignore}
  }
  :osc-string {
    :on-enter osc-start
    c0-prime? {:action ignore}
    (events :0x20-0x7F) {:action osc-put}
    (events 0x07) {:transition :ground} ; 0x07 is xterm non-ANSI variant of transition to :ground - THIS WON'T HAPPEN BECAUSE OF 0x07 IN ANYWHERE, REMOVE?
    :on-exit osc-end
  }
  :sos-pm-apc-string {
    c0-prime? {:action ignore}
    (events :0x20-0x7F) {:action ignore}
  }
})

(defn- get-transition [rules input]
  (some (fn [[pred cfg]] (when (pred input) cfg)) rules))

(defn parse [current-state input]
  (let [current-state-cfg (get states current-state)
        transition (or (get-transition anywhere-state input) (get-transition current-state-cfg input))]
    (if transition
      (let [transition-action (:action transition)]
        (if-let [new-state (:transition transition)]
          (let [new-state-cfg (get states new-state)
                exit-action (:on-exit current-state-cfg)
                entry-action (:on-enter new-state-cfg)
                actions (remove nil? [exit-action transition-action entry-action])]
            [new-state actions])
          [current-state (if transition-action [transition-action] [])])))))

(defn execute-actions [vt actions input]
  (reduce (fn [vt f] (f vt input)) vt actions))

(defn feed-one [vt input]
  (let [current-state (get-in vt [:parser :state])
        [new-state actions] (parse current-state input)]
    (-> vt
        (assoc-in [:parser :state] new-state)
        (execute-actions actions input))))

(defn feed [vt inputs]
  (reduce (fn [vt input] (feed-one vt input)) vt inputs))
