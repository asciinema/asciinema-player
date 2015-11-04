(ns asciinema-player.vt
  (:require [clojure.string :as string]))

;; References:
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
            :collect-chars []
            :param-chars []}
   :tabs (default-tabs width)
   :cursor {:x 0 :y 0 :visible true}
   :lines (empty-screen width height)})

;; actions

(defn ignore [vt input]
  vt)

(defn scroll-up [{width :width :as vt}]
  (update-in vt [:lines] (fn [lines]
                           (conj (vec (drop 1 lines)) (empty-line width)))))

(defn scroll-down [{width :width height :height :as vt}]
  (update-in vt [:lines] (fn [lines]
                           (vec (conj (take (dec height) lines) (empty-line width))))))

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

(defn execute [vt input]
  (condp = input
    0x08 (execute-bs vt)
    0x09 (execute-ht vt)
    0x0a (execute-lf vt)
    0x0b (execute-vt vt)
    0x0c (execute-ff vt)
    0x0d (execute-cr vt)
    0x84 (execute-ind vt)
    0x85 (execute-nel vt)
    0x88 (execute-hts vt)
    0x8d (execute-ri vt)
    vt))

(defn clear [vt input]
  (update-in vt [:parser] merge {:collect-chars [] :param-chars []}))

(defn collect [vt input]
  (update-in vt [:parser :collect-chars] conj input))

(defn param [vt input]
  vt)

(defn esc-dispatch [vt input]
  vt)

(defn csi-dispatch [vt input]
  vt)

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
