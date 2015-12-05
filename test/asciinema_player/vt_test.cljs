(ns asciinema-player.vt-test
  (:require-macros [cljs.test :refer (is deftest testing)]
                   [clojure.test.check.clojure-test :refer (defspec)])
  (:require [cljs.test]
            [clojure.test.check :as tc]
            [clojure.test.check.generators :as gen]
            [clojure.test.check.properties :as prop :include-macros true]
            [asciinema-player.vt :as vt :refer [parse make-vt feed feed-one feed-str get-params initial-saved-cursor]]))

(defn test-event [initial-state input expected-state expected-actions]
  (is (= (parse initial-state input) [expected-state expected-actions])))

(defn test-high-events
  ([initial-state] (test-high-events initial-state []))
  ([initial-state exit-actions]
   (doseq [input (range 0x80 (inc 0x8f))]
     (test-event initial-state input :ground (concat exit-actions [vt/execute])))

   (test-event initial-state 0x90 :dcs-entry (concat exit-actions [vt/clear]))

   (doseq [input (range 0x91 (inc 0x97))]
     (test-event initial-state input :ground (concat exit-actions [vt/execute])))

   (test-event initial-state 0x98 :sos-pm-apc-string exit-actions)

   (doseq [input (range 0x99 (inc 0x9a))]
     (test-event initial-state input :ground (concat exit-actions [vt/execute])))

   (test-event initial-state 0x9b :csi-entry (concat exit-actions [vt/clear]))
   (test-event initial-state 0x9c :ground exit-actions)
   (test-event initial-state 0x9d :osc-string (concat exit-actions [vt/osc-start]))
   (test-event initial-state 0x9e :sos-pm-apc-string exit-actions)
   (test-event initial-state 0x9f :sos-pm-apc-string exit-actions)))

(deftest parse-test
  (testing "all"
    (doseq [state (keys vt/states)
            input (range (inc 0x9f))]
      (is (not= (parse state input) nil))))

  (testing "ground"
    (doseq [input (range 0x00 (inc 0x1a))]
      (test-event :ground input :ground [vt/execute]))

    (test-event :ground 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :ground input :ground [vt/execute]))

    (doseq [input (range 0x20 (inc 0x7f))]
      (test-event :ground input :ground [vt/print]))

    (test-high-events :ground))

  (testing "escape"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :escape input :escape [vt/execute]))

    (test-event :escape 0x18 :ground [vt/execute])
    (test-event :escape 0x19 :escape [vt/execute])

    (test-event :escape 0x1a :ground [vt/execute])
    (test-event :escape 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :escape input :escape [vt/execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :escape input :escape-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x4f))]
      (test-event :escape input :ground [vt/esc-dispatch]))

    (test-event :escape 0x50 :dcs-entry [vt/clear])

    (doseq [input (range 0x51 (inc 0x57))]
      (test-event :escape input :ground [vt/esc-dispatch]))

    (test-event :escape 0x58 :sos-pm-apc-string [])
    (test-event :escape 0x59 :ground [vt/esc-dispatch])
    (test-event :escape 0x5a :ground [vt/esc-dispatch])
    (test-event :escape 0x5b :csi-entry [vt/clear])
    (test-event :escape 0x5c :ground [vt/esc-dispatch])
    (test-event :escape 0x5d :osc-string [vt/osc-start])
    (test-event :escape 0x5e :sos-pm-apc-string [])
    (test-event :escape 0x5f :sos-pm-apc-string [])

    (doseq [input (range 0x60 (inc 0x7e))]
      (test-event :escape input :ground [vt/esc-dispatch]))

    (test-event :escape 0x7f :escape [vt/ignore])

    (test-high-events :escape))

  (testing "escape-intermediate"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :escape-intermediate input :escape-intermediate [vt/execute]))

    (test-event :escape-intermediate 0x18 :ground [vt/execute])
    (test-event :escape-intermediate 0x19 :escape-intermediate [vt/execute])
    (test-event :escape-intermediate 0x1a :ground [vt/execute])
    (test-event :escape-intermediate 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :escape-intermediate input :escape-intermediate [vt/execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :escape-intermediate input :escape-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x7e))]
      (test-event :escape-intermediate input :ground [vt/esc-dispatch]))

    (test-event :escape-intermediate 0x7f :escape-intermediate [vt/ignore])

    (test-high-events :escape-intermediate))

  (testing "csi-entry"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-entry input :csi-entry [vt/execute]))

    (test-event :csi-entry 0x18 :ground [vt/execute])
    (test-event :csi-entry 0x19 :csi-entry [vt/execute])
    (test-event :csi-entry 0x1a :ground [vt/execute])
    (test-event :csi-entry 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-entry input :csi-entry [vt/execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :csi-entry input :csi-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :csi-entry input :csi-param [vt/param]))

    (test-event :csi-entry 0x3a :csi-ignore [])
    (test-event :csi-entry 0x3b :csi-param [vt/param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :csi-entry input :csi-param [vt/collect]))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-entry input :ground [vt/csi-dispatch]))

    (test-event :csi-entry 0x7f :csi-entry [vt/ignore])

    (test-high-events :csi-entry))

  (testing "csi-param"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-param input :csi-param [vt/execute]))

    (test-event :csi-param 0x18 :ground [vt/execute])
    (test-event :csi-param 0x19 :csi-param [vt/execute])
    (test-event :csi-param 0x1a :ground [vt/execute])
    (test-event :csi-param 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-param input :csi-param [vt/execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :csi-param input :csi-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :csi-param input :csi-param [vt/param]))

    (test-event :csi-param 0x3a :csi-ignore [])
    (test-event :csi-param 0x3b :csi-param [vt/param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :csi-param input :csi-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-param input :ground [vt/csi-dispatch]))

    (test-event :csi-param 0x7f :csi-param [vt/ignore])

    (test-high-events :csi-param))

  (testing "csi-intermediate"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-intermediate input :csi-intermediate [vt/execute]))

    (test-event :csi-intermediate 0x18 :ground [vt/execute])
    (test-event :csi-intermediate 0x19 :csi-intermediate [vt/execute])
    (test-event :csi-intermediate 0x1a :ground [vt/execute])
    (test-event :csi-intermediate 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-intermediate input :csi-intermediate [vt/execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :csi-intermediate input :csi-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x3f))]
      (test-event :csi-intermediate input :csi-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-intermediate input :ground [vt/csi-dispatch]))

    (test-event :csi-intermediate 0x7f :csi-intermediate [vt/ignore])

    (test-high-events :csi-intermediate))

  (testing "csi-ignore"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-ignore input :csi-ignore [vt/execute]))

    (test-event :csi-ignore 0x18 :ground [vt/execute])
    (test-event :csi-ignore 0x19 :csi-ignore [vt/execute])
    (test-event :csi-ignore 0x1a :ground [vt/execute])
    (test-event :csi-ignore 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-ignore input :csi-ignore [vt/execute]))

    (doseq [input (range 0x20 (inc 0x3f))]
      (test-event :csi-ignore input :csi-ignore [vt/ignore]))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-ignore input :ground []))

    (test-event :csi-ignore 0x7f :csi-ignore [vt/ignore])

    (test-high-events :csi-ignore))

  (testing "dcs-entry"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-entry input :dcs-entry [vt/ignore]))

    (test-event :dcs-entry 0x18 :ground [vt/execute])
    (test-event :dcs-entry 0x19 :dcs-entry [vt/ignore])
    (test-event :dcs-entry 0x1a :ground [vt/execute])
    (test-event :dcs-entry 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :dcs-entry input :dcs-entry [vt/ignore]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :dcs-entry input :dcs-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :dcs-entry input :dcs-param [vt/param]))

    (test-event :dcs-entry 0x3a :dcs-ignore [])
    (test-event :dcs-entry 0x3b :dcs-param [vt/param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :dcs-entry input :dcs-param [vt/collect]))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :dcs-entry input :dcs-passthrough [vt/hook]))

    (test-event :dcs-entry 0x7f :dcs-entry [vt/ignore])

    (test-high-events :dcs-entry))

  (testing "dcs-param"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-param input :dcs-param [vt/ignore]))

    (test-event :dcs-param 0x18 :ground [vt/execute])
    (test-event :dcs-param 0x19 :dcs-param [vt/ignore])
    (test-event :dcs-param 0x1a :ground [vt/execute])
    (test-event :dcs-param 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :dcs-param input :dcs-param [vt/ignore]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :dcs-param input :dcs-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :dcs-param input :dcs-param [vt/param]))

    (test-event :dcs-param 0x3a :dcs-ignore [])
    (test-event :dcs-param 0x3b :dcs-param [vt/param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :dcs-param input :dcs-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :dcs-param input :dcs-passthrough [vt/hook]))

    (test-event :dcs-param 0x7f :dcs-param [vt/ignore])

    (test-high-events :dcs-param))

  (testing "dcs-intermediate"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-intermediate input :dcs-intermediate [vt/ignore]))

    (test-event :dcs-intermediate 0x18 :ground [vt/execute])
    (test-event :dcs-intermediate 0x19 :dcs-intermediate [vt/ignore])
    (test-event :dcs-intermediate 0x1a :ground [vt/execute])
    (test-event :dcs-intermediate 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :dcs-intermediate input :dcs-intermediate [vt/ignore]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :dcs-intermediate input :dcs-intermediate [vt/collect]))

    (doseq [input (range 0x30 (inc 0x3f))]
      (test-event :dcs-intermediate input :dcs-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :dcs-intermediate input :dcs-passthrough [vt/hook]))

    (test-event :dcs-intermediate 0x7f :dcs-intermediate [vt/ignore])

    (test-high-events :dcs-intermediate))

  (testing "dcs-passthrough"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-passthrough input :dcs-passthrough [vt/put]))

    (test-event :dcs-passthrough 0x18 :ground [vt/unhook vt/execute])
    (test-event :dcs-passthrough 0x19 :dcs-passthrough [vt/put])
    (test-event :dcs-passthrough 0x1a :ground [vt/unhook vt/execute])
    (test-event :dcs-passthrough 0x1b :escape [vt/unhook vt/clear])

    (doseq [input (range 0x1c (inc 0x7e))]
      (test-event :dcs-passthrough input :dcs-passthrough [vt/put]))

    (test-event :dcs-passthrough 0x7f :dcs-passthrough [vt/ignore])

    (test-high-events :dcs-passthrough [vt/unhook]))

  (testing "dcs-ignore"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-ignore input :dcs-ignore [vt/ignore]))

    (test-event :dcs-ignore 0x18 :ground [vt/execute])
    (test-event :dcs-ignore 0x19 :dcs-ignore [vt/ignore])
    (test-event :dcs-ignore 0x1a :ground [vt/execute])
    (test-event :dcs-ignore 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x7f))]
      (test-event :dcs-ignore input :dcs-ignore [vt/ignore]))

    (test-high-events :dcs-ignore))

  (testing "osc-string"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :osc-string input :osc-string [vt/ignore]))

    (test-event :osc-string 0x18 :ground [vt/osc-end vt/execute])
    (test-event :osc-string 0x19 :osc-string [vt/ignore])
    (test-event :osc-string 0x1a :ground [vt/osc-end vt/execute])
    (test-event :osc-string 0x1b :escape [vt/osc-end vt/clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :osc-string input :osc-string [vt/ignore]))

    (doseq [input (range 0x20 (inc 0x7f))]
      (test-event :osc-string input :osc-string [vt/osc-put]))

    (test-high-events :osc-string [vt/osc-end]))

  (testing "sos-pm-apc-string"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :sos-pm-apc-string input :sos-pm-apc-string [vt/ignore]))

    (test-event :sos-pm-apc-string 0x18 :ground [vt/execute])
    (test-event :sos-pm-apc-string 0x19 :sos-pm-apc-string [vt/ignore])
    (test-event :sos-pm-apc-string 0x1a :ground [vt/execute])
    (test-event :sos-pm-apc-string 0x1b :escape [vt/clear])

    (doseq [input (range 0x1c (inc 0x7f))]
      (test-event :sos-pm-apc-string input :sos-pm-apc-string [vt/ignore]))

    (test-high-events :sos-pm-apc-string)))

(deftest make-vt-test
  (let [vt (make-vt 80 24)]
    (is (= (:tabs vt) #{8 16 24 32 40 48 56 64 72}))
    (is (= (-> vt :char-attrs) {}))
    (is (= (-> vt :saved) {:cursor {:x 0 :y 0}
                           :char-attrs {}
                           :auto-wrap-mode true
                           :origin-mode false}))
    (is (= (-> vt :parser :intermediate-chars) []))
    (is (= (-> vt :parser :param-chars) []))
    (is (= (-> vt :insert-mode) false))
    (is (= (-> vt :auto-wrap-mode) true))
    (is (= (-> vt :top-margin) 0))
    (is (= (-> vt :bottom-margin) 23))
    (is (= (-> vt :origin-mode) false)))
  (let [vt (make-vt 20 5)]
    (is (= (:tabs vt) #{8 16}))))

(defn feed-esc [vt str]
  (let [codes (map #(.charCodeAt % 0) str)]
    (feed vt (list* 0x1b codes))))

(defn feed-csi [vt & strs]
  (feed-esc vt (apply str (list* "[" strs))))

(defn move-cursor [vt x y]
  (feed-csi vt (str (inc y) ";" (inc x) "H")))

(defn set-fg [vt fg]
  (feed-csi vt (str "3" fg "m")))

(defn set-bg [vt bg]
  (feed-csi vt (str "4" bg "m")))

(defn set-bold [vt]
  (feed-csi vt "1m"))

(defn hide-cursor [vt]
  (assoc-in vt [:cursor :visible] false))

(deftest print-test
  (let [vt (-> (make-vt 4 3)
               (set-fg 1))]

    (testing "printing within single line"
      (let [{:keys [lines cursor]} (feed-str vt "ABC")]
        (is (= lines [[[0x41 {:fg 1}] [0x42 {:fg 1}] [0x43 {:fg 1}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= cursor {:x 3 :y 0 :visible true}))))

    (testing "printing in insert mode"
      (let [vt (-> vt
                   (feed-str "ABC")
                   (move-cursor 1 0)
                   (feed-csi "4h") ; enable insert mode
                   (set-fg 2)
                   (feed-str "HI"))]
        (let [{:keys [lines cursor]} vt]
          (is (= lines [[[0x41 {:fg 1}] [0x48 {:fg 2}] [0x49 {:fg 2}] [0x42 {:fg 1}]]
                        [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                        [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
          (is (= cursor {:x 3 :y 0 :visible true})))))

    (testing "printing on the right edge of the line"
      (let [vt (feed-str vt "ABCD")
            {:keys [lines cursor]} vt]
        (is (= lines [[[0x41 {:fg 1}] [0x42 {:fg 1}] [0x43 {:fg 1}] [0x44 {:fg 1}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= cursor {:x 3 :y 0 :visible true}))
        (let [vt (feed-str vt "EF")
              {:keys [lines cursor]} vt]
          (is (= lines [[[0x41 {:fg 1}] [0x42 {:fg 1}] [0x43 {:fg 1}] [0x44 {:fg 1}]]
                        [[0x45 {:fg 1}] [0x46 {:fg 1}] [0x20 {}] [0x20 {}]]
                        [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
          (is (= cursor {:x 2 :y 1 :visible true})))
        (let [vt (-> vt
                     (feed-csi "1;4H") ; move to the current position (in place)
                     (feed-str "EF"))  ; next-print-wraps should have been reset above
              {:keys [lines cursor]} vt]
          (is (= lines [[[0x41 {:fg 1}] [0x42 {:fg 1}] [0x43 {:fg 1}] [0x45 {:fg 1}]]
                        [[0x46 {:fg 1}] [0x20 {}] [0x20 {}] [0x20 {}]]
                        [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
          (is (= cursor {:x 1 :y 1 :visible true})))))

    (testing "printing on the right edge of the line (auto-wrap off)"
      (let [vt (-> vt
                   (feed-csi "?7l") ; reset auto-wrap
                   (feed-str "ABCDEF"))
            {:keys [lines cursor]} vt]
        (is (= lines [[[0x41 {:fg 1}] [0x42 {:fg 1}] [0x43 {:fg 1}] [0x46 {:fg 1}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= cursor {:x 3 :y 0 :visible true}))))

    (testing "printing on the bottom right edge of the screen"
      (let [vt (feed-str vt "AAAABBBBCCCC")
            {:keys [lines cursor]} vt]
        (is (= lines [[[0x41 {:fg 1}] [0x41 {:fg 1}] [0x41 {:fg 1}] [0x41 {:fg 1}]]
                      [[0x42 {:fg 1}] [0x42 {:fg 1}] [0x42 {:fg 1}] [0x42 {:fg 1}]]
                      [[0x43 {:fg 1}] [0x43 {:fg 1}] [0x43 {:fg 1}] [0x43 {:fg 1}]]]))
        (is (= cursor {:x 3 :y 2 :visible true}))
        (let [vt (feed-str vt "DD")
              {:keys [lines cursor]} vt]
          (is (= lines [[[0x42 {:fg 1}] [0x42 {:fg 1}] [0x42 {:fg 1}] [0x42 {:fg 1}]]
                        [[0x43 {:fg 1}] [0x43 {:fg 1}] [0x43 {:fg 1}] [0x43 {:fg 1}]]
                        [[0x44 {:fg 1}] [0x44 {:fg 1}] [0x20 {:fg 1}] [0x20 {:fg 1}]]]))
          (is (= cursor {:x 2 :y 2 :visible true})))))

    (testing "printing on the bottom right edge of the screen (auto-wrap off)"
      (let [vt (-> vt
                   (feed-str "AAAABBBBCC")
                   (feed-csi "?7l") ; reset auto-wrap
                   (feed-str "DDEFGH"))
            {:keys [lines cursor]} vt]
        (is (= lines [[[0x41 {:fg 1}] [0x41 {:fg 1}] [0x41 {:fg 1}] [0x41 {:fg 1}]]
                      [[0x42 {:fg 1}] [0x42 {:fg 1}] [0x42 {:fg 1}] [0x42 {:fg 1}]]
                      [[0x43 {:fg 1}] [0x43 {:fg 1}] [0x44 {:fg 1}] [0x48 {:fg 1}]]]))
        (is (= cursor {:x 3 :y 2 :visible true}))))))

(defn test-ind [f]
  (let [vt (-> (make-vt 4 7)
               (feed-str "AAAABBBBCCCCDDDDEEEEFFFFG")
               (set-bg 3))]
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 0 0) f)]
      (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 1)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 1 1) f)]
      (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 1))
      (is (= y 2)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 2 6) f)]
      (is (= lines [[[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                    [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
      (is (= x 2))
      (is (= y 6)))
    (let [vt (feed-csi vt "3;5r")] ; set scroll region 3-5
      (let [vt (-> vt (move-cursor 2 1) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 2)))
      (let [vt (-> vt (move-cursor 2 3) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 4)))
      (let [vt (-> vt (move-cursor 2 4) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 4)))
      (let [vt (-> vt (move-cursor 2 5) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 6)))
      (let [vt (-> vt (move-cursor 2 6) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 6))))))

(defn test-nel [f]
  (let [vt (-> (make-vt 4 7)
               (feed-str "AAAABBBBCCCCDDDDEEEEFFFFG")
               (set-bg 3))]
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 0 0) f)]
      (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 1)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 1 1) f)]
      (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 2)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 2 6) f)]
      (is (= lines [[[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                    [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
      (is (= x 0))
      (is (= y 6)))
    (let [vt (feed-csi vt "3;5r")] ; set scroll region 3-5
      (let [vt (-> vt (move-cursor 2 1) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 0))
        (is (= y 2)))
      (let [vt (-> vt (move-cursor 2 3) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 0))
        (is (= y 4)))
      (let [vt (-> vt (move-cursor 2 4) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 0))
        (is (= y 4)))
      (let [vt (-> vt (move-cursor 2 5) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 0))
        (is (= y 6)))
      (let [vt (-> vt (move-cursor 2 6) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 0))
        (is (= y 6))))))

(defn test-hts [f]
  (let [vt (make-vt 20 3)]
    (let [{tabs :tabs} (-> vt (move-cursor 0 0) f)]
      (is (= tabs #{8 16})))
    (let [{tabs :tabs} (-> vt (move-cursor 1 0) f)]
      (is (= tabs #{1 8 16})))
    (let [{tabs :tabs} (-> vt (move-cursor 11 0) f)]
      (is (= tabs #{8 11 16})))
    (let [{tabs :tabs} (-> vt (move-cursor 19 0) f)]
      (is (= tabs #{8 16 19})))))

(defn test-ri [f]
  (let [vt (-> (make-vt 4 7)
               (feed-str "AAAABBBBCCCCDDDDEEEEFFFFG")
               (set-bg 3))]
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 0 6) f)]
      (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 5)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 1 5) f)]
      (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                    [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 1))
      (is (= y 4)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 2 0) f)]
      (is (= lines [[[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                    [[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]]))
      (is (= x 2))
      (is (= y 0)))
    (let [vt (feed-csi vt "3;5r")] ; set scroll region 3-5
      (let [vt (-> vt (move-cursor 2 5) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 4)))
      (let [vt (-> vt (move-cursor 2 3) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 2)))
      (let [vt (-> vt (move-cursor 2 2) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 2)))
      (let [vt (-> vt (move-cursor 2 1) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 0)))
      (let [vt (-> vt (move-cursor 2 0) f)
            {lines :lines {x :x y :y} :cursor} vt]
        (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                      [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x44 {}] [0x44 {}]]
                      [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                      [[0x46 {}] [0x46 {}] [0x46 {}] [0x46 {}]]
                      [[0x47 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 0))))))

(deftest control-char-test
  (let [vt (make-vt 4 3)]
    (testing "0x00 (NUL)"
      (is (= vt (feed-one vt 0x00))))

    (testing "0x01 (SOH)"
      (is (= vt (feed-one vt 0x01))))

    (testing "0x02 (STX)"
      (is (= vt (feed-one vt 0x02))))

    (testing "0x03 (ETX)"
      (is (= vt (feed-one vt 0x03))))

    (testing "0x04 (EOT)"
      (is (= vt (feed-one vt 0x04))))

    (testing "0x05 (ENQ)"
      (is (= vt (feed-one vt 0x05))))

    (testing "0x06 (ACK)"
      (is (= vt (feed-one vt 0x06))))

    (testing "0x07 (BEL)"
      (is (= vt (feed-one vt 0x07))))

    (testing "0x08 (BS)"
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 0 0) (feed-one 0x08))]
        (is (= x 0))
        (is (= y 0)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 2 0) (feed-one 0x08))]
        (is (= x 1))
        (is (= y 0)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 0 2) (feed-one 0x08))]
        (is (= x 0))
        (is (= y 2))))

    (testing "0x09 (HT)"
      (let [vt (make-vt 20 3)]
        (let [{{x :x y :y} :cursor} (-> vt (move-cursor 0 0) (feed-one 0x09))]
          (is (= x 8))
          (is (= y 0)))
        (let [{{x :x y :y} :cursor} (-> vt (move-cursor 2 0) (feed-one 0x09))]
          (is (= x 8))
          (is (= y 0)))
        (let [{{x :x y :y} :cursor} (-> vt (move-cursor 8 1) (feed-one 0x09))]
          (is (= x 16))
          (is (= y 1)))
        (let [{{x :x y :y} :cursor} (-> vt (move-cursor 9 1) (feed-one 0x09))]
          (is (= x 16))
          (is (= y 1)))
        (let [{{x :x y :y} :cursor} (-> vt (move-cursor 16 1) (feed-one 0x09))]
          (is (= x 19))
          (is (= y 1)))
        (let [{{x :x y :y} :cursor} (-> vt (move-cursor 19 1) (feed-one 0x09))]
          (is (= x 19))
          (is (= y 1)))))

    (testing "0x0a (LF), 0x85 (NEL)"
      (doseq [ch [0x0a 0x85]]
        (test-nel #(feed-one % ch))))

    (testing "0x0b (VT), 0x0c (FF), 0x84 (IND)"
      (doseq [ch [0x0b 0x0c 0x84]]
        (test-ind #(feed-one % ch))))

    (testing "0x0d (CR)"
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 0 1) (feed-one 0x0d))]
        (is (= x 0))
        (is (= y 1)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 2 1) (feed-one 0x0d))]
        (is (= x 0))
        (is (= y 1))))

    (testing "0x88 (HTS)"
      (test-hts #(feed-one % 0x88)))

    (testing "0x8d (RI)"
      (test-ri #(feed-one % 0x8d)))))

(deftest esc-sequence-test
  (testing "ESC D (IND)"
    (test-ind #(feed-esc % "D")))

  (testing "ESC E (NEL)"
    (test-nel #(feed-esc % "E")))

  (testing "ESC H (HTS)"
    (test-hts #(feed-esc % "H")))

  (testing "ESC M (RI)"
    (test-ri #(feed-esc % "M")))

  (testing "ESC #8 (DECALN)"
    (let [vt (-> (make-vt 4 3)
                 (move-cursor 2 1)
                 (feed-esc "#8"))
          {lines :lines {x :x y :y} :cursor} vt]
      (is (= lines [[[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]]))
      (is (= x 2))
      (is (= y 1))))

  (testing "ESC 7 (SC), CSI ?1048h"
    (let [vt (-> (make-vt 80 24)
                 (move-cursor 2 1)
                 (set-fg 1)
                 (feed-csi "?6h") ; set origin mode
                 (feed-csi "?7l") ; reset auto-wrap mode
                 (move-cursor 4 5))]
      (doseq [f [#(feed-esc % "7") #(feed-csi % "?1048h")]]
        (let [{:keys [saved]} (f vt)]
          (is (= saved {:cursor {:x 4 :y 5}
                        :char-attrs {:fg 1}
                        :origin-mode true
                        :auto-wrap-mode false}))))))

  (testing "ESC 8 (RC), CSI ?1048l"
    (let [vt (-> (make-vt 80 24)
                 (set-fg 1)
                 (feed-csi "?6h") ; set origin mode
                 (feed-csi "?7l") ; reset auto-wrap mode
                 (move-cursor 4 5))]
      (doseq [f [#(feed-esc % "8") #(feed-csi % "?1048l")]]
        (let [vt (f vt) ; restore cursor, there was no save (SC) so far
              {{:keys [x y]} :cursor :keys [char-attrs origin-mode auto-wrap-mode]} vt]
          (is (= x 0))
          (is (= y 0))
          (is (= char-attrs {}))
          (is (false? origin-mode))
          (is (true? auto-wrap-mode)))
        (let [vt (-> vt
                     (feed-esc "7") ; save cursor
                     (feed-csi "?6l") ; reset origin mode
                     (feed-csi "?7h") ; set auto-wrap mode
                     (feed-csi "m") ; reset char attrs
                     (feed-csi "42m") ; set bg=2
                     f) ; restore cursor
              {{:keys [x y]} :cursor :keys [char-attrs origin-mode auto-wrap-mode]} vt]
          (is (= x 4))
          (is (= y 5))
          (is (= char-attrs {:fg 1}))
          (is (true? origin-mode))
          (is (false? auto-wrap-mode))))))

  (testing "ESC c (RIS)"
    (let [initial-vt (make-vt 4 3)
          new-vt (-> initial-vt
                     (feed-str "AB")
                     (feed-esc "H") ; set tab
                     (feed-esc "c"))] ; reset
      (is (= initial-vt new-vt)))))

(deftest control-sequence-test
  (testing "CSI @ (ICH)"
    (let [vt (-> (make-vt 5 3)
                 (feed-str "ABCD")
                 (set-bg 3)
                 (move-cursor 1 0))]
      (let [vt (feed-csi vt "@")
            {{x :x y :y} :cursor [line0 & _] :lines} vt]
        (is (= x 1))
        (is (= y 0))
        (is (= line0 [[0x41 {}] [0x20 {:bg 3}] [0x42 {}] [0x43 {}] [0x44 {}]])))
      (let [vt (feed-csi vt "2@")
            {{x :x y :y} :cursor [line0 & _] :lines} vt]
        (is (= x 1))
        (is (= y 0))
        (is (= line0 [[0x41 {}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x42 {}] [0x43 {}]])))))

  (testing "CSI A (CUU), CSI e (VPR)"
    (let [vt (make-vt 5 10)]
      (doseq [ch ["A" "e"]]
        (let [vt (-> vt
                     (move-cursor 1 0)
                     (feed-csi ch))
              {{x :x y :y} :cursor} vt]
          (is (= x 1))
          (is (= y 0)))
        (let [vt (-> vt
                     (move-cursor 1 2)
                     (feed-csi ch))
              {{x :x y :y} :cursor} vt]
          (is (= x 1))
          (is (= y 1)))
        (let [vt (-> vt
                     (move-cursor 1 2)
                     (feed-csi "4" ch))
              {{x :x y :y} :cursor} vt]
          (is (= x 1))
          (is (= y 0)))
        (let [vt (feed-csi vt "4;8r")] ; set scroll region
          (let [vt (-> vt
                       (move-cursor 1 2)
                       (feed-csi ch))
                {{y :y} :cursor} vt]
            (is (= y 1)))
          (let [vt (-> vt
                       (move-cursor 1 6)
                       (feed-csi "5" ch))
                {{y :y} :cursor} vt]
            (is (= y 3)))
          (let [vt (-> vt
                       (move-cursor 1 9)
                       (feed-csi "9" ch))
                {{y :y} :cursor} vt]
            (is (= y 3)))))))

  (testing "CSI B (CUD)"
    (let [vt (make-vt 5 10)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed-csi "B"))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 1 9)
                   (feed-csi "B"))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 9)))
      (let [vt (-> vt
                   (move-cursor 1 7)
                   (feed-csi "4B"))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 9)))
      (let [vt (feed-csi vt "4;8r")] ; set scroll region
        (let [vt (-> vt
                     (move-cursor 1 1)
                     (feed-csi "20B"))
              {{y :y} :cursor} vt]
          (is (= y 7)))
        (let [vt (-> vt
                     (move-cursor 1 6)
                     (feed-csi "5B"))
              {{y :y} :cursor} vt]
          (is (= y 7)))
        (let [vt (-> vt
                     (move-cursor 1 8)
                     (feed-csi "B"))
              {{y :y} :cursor} vt]
          (is (= y 9))))))

  (testing "CSI C (CUF), CSI a (HPR)"
    (let [vt (make-vt 5 3)]
      (doseq [ch ["C" "a"]]
        (let [vt (-> vt
                     (move-cursor 1 0)
                     (feed-csi ch))
              {{x :x y :y} :cursor} vt]
          (is (= x 2))
          (is (= y 0)))
        (let [vt (-> vt
                     (move-cursor 4 0)
                     (feed-csi ch))
              {{x :x y :y} :cursor} vt]
          (is (= x 4))
          (is (= y 0)))
        (let [vt (-> vt
                     (move-cursor 2 1)
                     (feed-csi "4" ch))
              {{x :x y :y} :cursor} vt]
          (is (= x 4))
          (is (= y 1))))))

  (testing "CSI D (CUB)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 3 0)
                   (feed-csi "D"))
            {{x :x y :y} :cursor} vt]
        (is (= x 2))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 0 1)
                   (feed-csi "D"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 2 1)
                   (feed-csi "4D"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))))

  (testing "CSI E (CNL)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed-csi "E"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed-csi "E"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 2)))
      (let [vt (-> vt
                   (move-cursor 1 1)
                   (feed-csi "4E"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 2)))))

  (testing "CSI F (CPL)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed-csi "F"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed-csi "F"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed-csi "4F"))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 0)))))

  (testing "CSI G (CHA), CSI ` (HPA)"
    (let [vt (-> (make-vt 5 3)
                 (move-cursor 1 1))]
      (doseq [ch ["G" "`"]]
        (let [vt (feed-csi vt ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 0))
          (is (= y 1)))
        (let [vt (feed-csi vt "3" ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 2))
          (is (= y 1)))
        (let [vt (feed-csi vt "8" ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 4))
          (is (= y 1))))))

  (testing "CSI H (CUP), CSI f (HVP)"
    (let [vt (-> (make-vt 20 10)
                 (move-cursor 1 1))]
      (doseq [ch ["H" "f"]]
        (let [vt (feed-csi vt ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 0))
          (is (= y 0)))
        (let [vt (feed-csi vt "3" ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 0))
          (is (= y 2)))
        (let [vt (feed-csi vt ";3" ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 2))
          (is (= y 0)))
        (let [vt (feed-csi vt "3;4" ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 3))
          (is (= y 2)))
        (let [vt (feed-csi vt "15;25" ch)
              {{x :x y :y} :cursor} vt]
          (is (= x 19))
          (is (= y 9)))
        (let [vt (feed-csi vt "4;6r")] ; set scroll region
          (let [vt (feed-csi vt "3;8" ch)
                {{x :x y :y} :cursor} vt]
            (is (= x 7))
            (is (= y 2)))
          (let [vt (feed-csi vt "5;8" ch)
                {{x :x y :y} :cursor} vt]
            (is (= x 7))
            (is (= y 4)))
          (let [vt (feed-csi vt "15;25" ch)
                {{x :x y :y} :cursor} vt]
            (is (= x 19))
            (is (= y 9)))
          (let [vt (feed-csi vt "?6h")] ; set origin mode
            (let [vt (feed-csi vt "2;7" ch)
                  {{x :x y :y} :cursor} vt]
              (is (= x 6))
              (is (= y 4)))
            (let [vt (feed-csi vt "15;25" ch)
                  {{x :x y :y} :cursor} vt]
              (is (= x 19))
              (is (= y 5))))))))

  (testing "CSI I (CHT)"
    (let [vt (-> (make-vt 80 3) (move-cursor 20 0))]
      (let [{{x :x y :y} :cursor} (feed-csi vt "I")]
        (is (= x 24))
        (is (= y 0)))
      (let [{{x :x y :y} :cursor} (feed-csi vt "3I")]
        (is (= x 40))
        (is (= y 0)))))

  (testing "CSI J (ED)"
    (let [vt (-> (make-vt 4 3)
                 (feed-str "ABCDEFGHIJ")
                 (set-bg 3)
                 (move-cursor 1 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "J")]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x45 {}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
        (is (= x 1))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "1J")]
        (is (= lines [[[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x47 {}] [0x48 {}]]
                      [[0x49 {}] [0x4a {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 1))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "2J")]
        (is (= lines [[[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
        (is (= x 1))
        (is (= y 1)))))

  (testing "CSI K (EL)"
    (let [vt (-> (make-vt 6 2)
                 (feed-str "ABCDEF")
                 (set-bg 3)
                 (move-cursor 3 0))]
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "K")]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x43 {}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]))
        (is (= x 3))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "1K")]
        (is (= line0 [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x45 {}] [0x46 {}]]))
        (is (= x 3))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "2K")]
        (is (= line0 [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]))
        (is (= x 3))
        (is (= y 0)))))

  (testing "CSI L (IL)"
    (let [vt (-> (make-vt 4 4)
                 (feed-str "ABCDEFGHIJ")
                 (set-bg 3)
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "L")]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]
                      [[0x49 {}] [0x4a {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "2L")]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "10L")]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI M (DL)"
    (let [vt (-> (make-vt 4 4)
                 (feed-str "ABCDEFGHIJKLM")
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "M")]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x49 {}] [0x4a {}] [0x4b {}] [0x4c {}]]
                      [[0x4d {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "2M")]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x4d {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "10M")]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI P (DCH)"
    (let [vt (-> (make-vt 7 1)
                 (feed-str "ABCDEF")
                 (move-cursor 2 0))]
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "P")]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x44 {}] [0x45 {}] [0x46 {}] [0x20 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "2P")]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x45 {}] [0x46 {}] [0x20 {}] [0x20 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))))

  (testing "CSI S (SU)"
    (let [vt (-> (make-vt 4 3)
                 (feed-str "ABCDEFGHIJ")
                 (set-bg 3)
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "S")]
        (is (= lines [[[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]
                      [[0x49 {}] [0x4a {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "2S")]
        (is (= lines [[[0x49 {}] [0x4a {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "10S")]
        (is (= lines [[[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI T (SD)"
    (let [vt (-> (make-vt 4 3)
                 (feed-str "ABCDEFGHIJ")
                 (set-bg 3)
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "T")]
        (is (= lines [[[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "2T")]
        (is (= lines [[[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed-csi vt "10T")]
        (is (= lines [[[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]
                      [[0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI W (CTC)"
    (let [vt (-> (make-vt 30 24))]
      (let [{:keys [tabs]} (-> vt (move-cursor 5 0) (feed-csi "W"))]
        (is (= tabs #{5 8 16 24})))
      (let [{:keys [tabs]} (-> vt (move-cursor 5 0) (feed-csi "0W"))]
        (is (= tabs #{5 8 16 24})))
      (let [{:keys [tabs]} (-> vt (move-cursor 16 0) (feed-csi "2W"))]
        (is (= tabs #{8 24})))
      (let [{:keys [tabs]} (-> vt (feed-csi "5W"))]
        (is (= tabs #{})))))

  (testing "CSI X (ECH)"
    (let [vt (-> (make-vt 7 1)
                 (feed-str "ABCDEF")
                 (set-bg 3)
                 (move-cursor 2 0))]
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "X")]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x20 {:bg 3}] [0x44 {}] [0x45 {}] [0x46 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "2X")]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x45 {}] [0x46 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed-csi vt "100X")]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}] [0x20 {:bg 3}]]))
        (is (= x 2))
        (is (= y 0)))
      ))

  (testing "CSI Z"
    (let [vt (make-vt 20 3)]
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 0 0) (feed-csi "Z"))]
        (is (= x 0))
        (is (= y 0)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 2 0) (feed-csi "2Z"))]
        (is (= x 0))
        (is (= y 0)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 8 1) (feed-csi "Z"))]
        (is (= x 0))
        (is (= y 1)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 9 1) (feed-csi "Z"))]
        (is (= x 8))
        (is (= y 1)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 18 1) (feed-csi "2Z"))]
        (is (= x 8))
        (is (= y 1)))))

  (testing "CSI d (VPA)"
    (let [vt (-> (make-vt 80 24)
                 (move-cursor 15 1))]
      (let [{{:keys [x y]} :cursor} (feed-csi vt "d")]
        (is (= x 15))
        (is (= y 0)))
      (let [{{:keys [x y]} :cursor} (feed-csi vt "5d")]
        (is (= x 15))
        (is (= y 4)))
      (let [vt (feed-csi vt "10;15r")] ; set scroll region
        (let [{{:keys [x y]} :cursor} (feed-csi vt "5d")]
          (is (= y 4)))
        (let [vt (feed-csi vt "?6h")] ; set origin mode
          (let [{{:keys [x y]} :cursor} (feed-csi vt "3d")]
            (is (= y 11)))
          (let [{{:keys [x y]} :cursor} (feed-csi vt "8d")]
            (is (= y 14)))))))

  (testing "CSI g (TBC)"
    (let [vt (-> (make-vt 45 24)
                 (move-cursor 24 0))]
      (let [{:keys [tabs]} (feed-csi vt "g")]
        (is (= tabs #{8 16 32 40})))
      (let [{:keys [tabs]} (feed-csi vt "3g")]
        (is (= tabs #{})))))

  (testing "CSI h (SM)"
    (let [vt (make-vt 4 3)]
      (let [{:keys [insert-mode]} (feed-csi vt "4h")]
        (is (= insert-mode true)))))

  (testing "CSI ?h (DECSM)"
    (let [vt (make-vt 20 10)]
      (testing "showing cursor"
        (let [vt (-> vt
                     hide-cursor
                     (feed-csi "?25h")) ; show cursor
              {{:keys [visible]} :cursor} vt]
          (is (= visible true))))
      (testing "setting origin mode"
        (let [vt (-> vt
                     (feed-csi "3;5r") ; set scroll region
                     (move-cursor 1 1)
                     (feed-csi "?6h")) ; set origin mode
              {:keys [origin-mode] {:keys [x y]} :cursor} vt]
          (is (= origin-mode true))
          (is (= x 0))
          (is (= y 2))))
      (testing "setting auto-wrap mode"
        (let [vt (feed-csi vt "?7h")
              {:keys [auto-wrap-mode]} vt]
          (is (= auto-wrap-mode true))))
      (testing "setting multiple modes"
        (let [vt (feed-csi vt "?6;7;25h")
              {:keys [origin-mode auto-wrap-mode] {cursor-visible :visible} :cursor} vt]
          (is (true? origin-mode))
          (is (true? auto-wrap-mode))
          (is (true? cursor-visible)))))
    (let [vt (make-vt 4 3)]
      (testing "setting alternate screen mode"
        (testing "when in primary buffer"
          (let [vt (-> vt
                       (feed-str "ABC\nDE")
                       (set-bg 2)
                       (feed-csi "?1047h"))
                {:keys [lines] {:keys [x y]} :cursor} vt]
            (is (= x 2))
            (is (= y 1))
            (is (= lines [[[0x20 {:bg 2}] [0x20 {:bg 2}] [0x20 {:bg 2}] [0x20 {:bg 2}]]
                          [[0x20 {:bg 2}] [0x20 {:bg 2}] [0x20 {:bg 2}] [0x20 {:bg 2}]]
                          [[0x20 {:bg 2}] [0x20 {:bg 2}] [0x20 {:bg 2}] [0x20 {:bg 2}]]]))))
        (testing "when in alternate buffer"
          (let [vt (-> vt
                       (feed-csi "?1047h")
                       (feed-str "ABC\nDE")
                       (feed-csi "?1047h"))
                {:keys [lines] {:keys [x y]} :cursor} vt]
            (is (= x 2))
            (is (= y 1))
            (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x20 {}]]
                          [[0x44 {}] [0x45 {}] [0x20 {}] [0x20 {}]]
                          [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]])))))))

  (testing "CSI l (RM)"
    (let [vt (make-vt 4 3)]
      (let [{:keys [insert-mode]} (feed-csi vt "4l")]
        (is (= insert-mode false)))))

  (testing "CSI ?l (DECRM)"
    (let [vt (make-vt 4 3)]
      (testing "hiding cursor"
        (let [vt (feed-csi vt "?25l"); hide cursor
              {{:keys [visible]} :cursor} vt]
          (is (= visible false))))
      (testing "resetting origin mode"
        (let [vt (-> vt
                     (feed-csi "3;5r") ; set scroll region
                     (feed-csi "?6h") ; set origin mode
                     (move-cursor 1 1)
                     (feed-csi "?6l")) ; reset origin mode
              {:keys [origin-mode] {:keys [x y]} :cursor} vt]
          (is (= origin-mode false))
          (is (= x 0))
          (is (= y 0))))
      (testing "resetting auto-wrap mode"
        (let [vt (feed-csi vt "?7l")
              {:keys [auto-wrap-mode]} vt]
          (is (= auto-wrap-mode false))))
      (testing "resetting multiple modes"
        (let [vt (feed-csi vt "?6;7;25l")
              {:keys [origin-mode auto-wrap-mode] {cursor-visible :visible} :cursor} vt]
          (is (false? origin-mode))
          (is (false? auto-wrap-mode))
          (is (false? cursor-visible)))))
    (let [vt (make-vt 4 3)]
      (testing "resetting alternate screen mode"
        (testing "when in primary buffer"
          (let [vt (-> vt
                       (feed-str "ABC\nDE")
                       (feed-csi "?1047l")) ; set primary buffer
                {:keys [lines] {:keys [x y]} :cursor} vt]
            (is (= x 2))
            (is (= y 1))
            (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x20 {}]]
                          [[0x44 {}] [0x45 {}] [0x20 {}] [0x20 {}]]
                          [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))))
        (testing "when in alternate buffer"
          (let [vt (-> vt
                       (feed-str "ABC\nDE")
                       (set-bg 2)
                       (feed-csi "?1047h") ; set alternate buffer
                       (feed-str "\nX")
                       (feed-csi "?1047l")) ; set primary buffer
                {:keys [lines] {:keys [x y]} :cursor} vt]
            (is (= x 1))
            (is (= y 2))
            (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x20 {}]]
                          [[0x44 {}] [0x45 {}] [0x20 {}] [0x20 {}]]
                          [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]])))))))

  (testing "CSI m (SGR)"
    (let [vt (make-vt 20 1)
          vt (reduce feed-csi vt ["0mA"
                                  "1mA" ; turn on bold
                                  "3mA" ; turn on italic
                                  "4mA" ; turn on underline
                                  "5mA" ; turn on blink
                                  "7mA" ; turn on inverse
                                  "21mA" ; turn off bold
                                  "23mA" ; turn off italic
                                  "24mA" ; turn off underline
                                  "25mA" ; turn off blink
                                  "27mA" ; turn off inverse
                                  "32;43mA" ; fg 2, bg 3
                                  "39mA" ; default fg
                                  "49mA" ; default bg
                                  "32;43;1mA" ; fg 2, bg 3, bold
                                  "0mA" ; reset all attrs (explicit "0" param)
                                  "32;43;1mA" ; fg 2, bg 3, bold
                                  "mA" ; reset all attrs (implicit "0" param)
                                  "1;38;5;88;48;5;99;5mA"]) ; bold, fg 88, bg 99, blink
          {:keys [lines]} vt
          [line0 & _] lines]
      (is (= line0 [[0x41 {}]
                    [0x41 {:bold true}]
                    [0x41 {:bold true :italic true}]
                    [0x41 {:bold true :italic true :underline true}]
                    [0x41 {:bold true :italic true :underline true :blink true}]
                    [0x41 {:bold true :italic true :underline true :blink true :inverse true}]
                    [0x41 {:italic true :underline true :blink true :inverse true}]
                    [0x41 {:underline true :blink true :inverse true}]
                    [0x41 {:blink true :inverse true}]
                    [0x41 {:inverse true}]
                    [0x41 {}]
                    [0x41 {:fg 2 :bg 3}]
                    [0x41 {:bg 3}]
                    [0x41 {}]
                    [0x41 {:fg 2 :bg 3 :bold true}]
                    [0x41 {}]
                    [0x41 {:fg 2 :bg 3 :bold true}]
                    [0x41 {}]
                    [0x41 {:fg 88 :bg 99 :bold true :blink true}]
                    [0x20 {}]]))))

  (testing "CSI !p (DECSTR)"
    (let [vt (-> (make-vt 4 4)
                 (feed-str "ABCDEFGHI")
                 (feed-csi "2;3r") ; set scroll region
                 (feed-csi "?6h") ; set origin mode
                 (feed-csi "4h") ; set insert mode
                 (feed-csi "?25l") ; hide cursor
                 (move-cursor 2 1) ; this will be relative to top margin
                 (set-fg 1)
                 (feed-esc "7") ; save cursor
                 (feed-csi "!p"))] ; soft reset
      (is (= (:lines vt) [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                          [[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]
                          [[0x49 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                          [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= (:cursor vt) {:x 2 :y 2 :visible true}))
      (is (= (:char-attrs vt) {}))
      (is (= (:insert-mode vt) false))
      (is (= (:origin-mode vt) false))
      (is (= (:top-margin vt) 0))
      (is (= (:bottom-margin vt) 3))
      (is (= (:saved vt) initial-saved-cursor))))

  (testing "CSI r (DECSTBM)"
    (let [vt (make-vt 80 24)]
      (let [{:keys [top-margin bottom-margin] {:keys [x y]} :cursor} (feed-csi vt "r")]
        (is (= top-margin 0))
        (is (= bottom-margin 23))
        (is (= x 0))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 20 10)
                   (feed-csi "5;15r"))
            {:keys [top-margin bottom-margin] {:keys [x y]} :cursor} vt]
        (is (= top-margin 4))
        (is (= bottom-margin 14))
        (is (= x 0))
        (is (= y 0)))
      (let [vt (-> vt
                   (feed-csi "?6h") ; set origin mode
                   (move-cursor 20 10)
                   (feed-csi "5;15r")) ; set scroll region
            {{:keys [x y]} :cursor} vt]
        (is (= x 0))
        (is (= y 4))))))

(deftest get-params-test
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser :param-chars] []))]
    (is (= (get-params vt) [])))
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser :param-chars] [0x33]))]
    (is (= (get-params vt) [3])))
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser :param-chars] [0x3b 0x3b 0x31 0x32 0x3b 0x3b 0x32 0x33 0x3b 0x31 0x3b]))]
    (is (= (get-params vt) [0 0 12 0 23 1]))))

(def gen-rubbish (gen/vector (gen/choose 0 0x9f) 1 100))

(defspec test-parser-state-for-random-input
  100
  (prop/for-all [rubbish gen-rubbish]
                (let [vt (-> (make-vt 80 24) (feed rubbish))]
                  (keyword? (-> vt :parser :state)))))

(defspec test-cursor-position-for-random-input
  100
  (prop/for-all [x (gen/choose 0 19)
                 y (gen/choose 0 9)
                 rubbish gen-rubbish]
                (let [vt (-> (make-vt 20 10)
                             (move-cursor x y)
                             (feed rubbish))
                      {{:keys [x y]} :cursor} vt]
                  (and (< -1 x 20)
                       (< -1 y 10)))))

(defspec test-row-and-column-count-for-random-input
  {:num-tests 100}
  (prop/for-all [x (gen/choose 0 19)
                 y (gen/choose 0 9)
                 rubbish gen-rubbish]
                (let [vt (-> (make-vt 20 10)
                             (move-cursor x y)
                             (feed rubbish))
                      {:keys [lines]} vt]
                  (and (= 10 (count lines))
                       (every? #(= 20 (count %)) lines)))))

(defspec test-no-wrapping-after-moved-from-right-margin
  {:num-tests 100}
  (prop/for-all [y (gen/choose 0 9)
                 rubbish gen-rubbish]
                (let [vt (-> (make-vt 20 10)
                             (move-cursor 19 y)
                             (feed rubbish))
                      {{new-x :x new-y :y} :cursor :keys [next-print-wraps]} vt]
                  (not (and next-print-wraps (not= new-x 19))))))
