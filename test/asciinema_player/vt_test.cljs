(ns asciinema-player.vt-test
  (:require-macros [cljs.test :refer (is deftest testing)]
                   [clojure.test.check.clojure-test :refer (defspec)])
  (:require [cljs.test]
            [clojure.test.check :as tc]
            [clojure.test.check.generators :as gen]
            [clojure.test.check.properties :as prop :include-macros true]
            [asciinema-player.vt :as vt :refer [parse make-vt feed feed-one get-params]]))

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
    (is (= (-> vt :saved) {:cursor {:x 0 :y 0} :char-attrs {}}))
    (is (= (-> vt :parser :intermediate-chars) []))
    (is (= (-> vt :parser :param-chars) []))
    (is (= (-> vt :insert-mode) false)))
  (let [vt (make-vt 20 5)]
    (is (= (:tabs vt) #{8 16}))))

(defn move-cursor [vt x y]
  (-> vt
      (assoc-in [:cursor :x] x)
      (assoc-in [:cursor :y] y)))

(deftest print-test
  (let [vt (make-vt 4 3)]

    (testing "printing within single line"
      (let [{:keys [lines cursor]} (feed vt [0x41 0x42 0x43])]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= cursor {:x 3 :y 0 :visible true}))))

    (testing "printing in insert mode"
      (let [vt (-> vt
                   (feed [0x41 0x42 0x43])
                   (move-cursor 1 0)
                   (feed [0x1b 0x5b 0x34 0x68])
                   (feed [0x48 0x49]))] ; enable insert mode
        (let [{:keys [lines cursor]} vt]
          (is (= lines [[[0x41 {}] [0x48 {}] [0x49 {}] [0x42 {}]]
                        [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                        [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
          (is (= cursor {:x 3 :y 0 :visible true})))))

    (testing "printing on the right edge of the line"
      (let [{:keys [lines cursor]} (feed vt [0x41 0x42 0x43 0x44])]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= cursor {:x 0 :y 1 :visible true}))))

    (testing "printing on the bottom right edge of the screen"
      (let [{:keys [lines cursor]} (feed vt [0x41 0x41 0x41 0x41
                                             0x42 0x42 0x42 0x42
                                             0x43 0x43 0x43 0x43
                                             0x44 0x44])]
        (is (= lines [[[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                      [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                      [[0x44 {}] [0x44 {}] [0x20 {}] [0x20 {}]]]))
        (is (= cursor {:x 2 :y 2 :visible true}))))))

(defn test-ind [inputs]
  (let [vt (-> (make-vt 4 3)
               (feed [0x41 0x41 0x41 0x41
                      0x42 0x42 0x42 0x42
                      0x43 0x43 0x43 0x43
                      0x44 0x44]))]
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 0 0) (feed inputs))]
      (is (= lines [[[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 1)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 1 1) (feed inputs))]
      (is (= lines [[[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 1))
      (is (= y 2)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 2 2) (feed inputs))]
      (is (= lines [[[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x20 {}] [0x20 {}]]
                    [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 2))
      (is (= y 2)))))

(defn test-nel [inputs]
  (let [vt (-> (make-vt 4 3)
               (feed [0x41 0x41 0x41 0x41
                      0x42 0x42 0x42 0x42
                      0x43 0x43 0x43 0x43
                      0x44 0x44]))]
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 0 0) (feed inputs))]
      (is (= lines [[[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 1)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 1 1) (feed inputs))]
      (is (= lines [[[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 2)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 2 2) (feed inputs))]
      (is (= lines [[[0x43 {}] [0x43 {}] [0x43 {}] [0x43 {}]]
                    [[0x44 {}] [0x44 {}] [0x20 {}] [0x20 {}]]
                    [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 0))
      (is (= y 2)))))

(defn test-hts [inputs]
  (let [vt (make-vt 20 3)]
    (let [{tabs :tabs} (-> vt (move-cursor 0 0) (feed inputs))]
      (is (= tabs #{8 16})))
    (let [{tabs :tabs} (-> vt (move-cursor 1 0) (feed inputs))]
      (is (= tabs #{1 8 16})))
    (let [{tabs :tabs} (-> vt (move-cursor 11 0) (feed inputs))]
      (is (= tabs #{8 11 16})))
    (let [{tabs :tabs} (-> vt (move-cursor 19 0) (feed inputs))]
      (is (= tabs #{8 16 19})))))

(defn test-ri [inputs]
  (let [vt (-> (make-vt 4 3)
               (feed [0x41 0x41 0x41 0x41
                      0x42 0x42 0x42 0x42
                      0x43 0x43]))]
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 2 1) (feed inputs))]
      (is (= lines [[[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]
                    [[0x43 {}] [0x43 {}] [0x20 {}] [0x20 {}]]]))
      (is (= x 2))
      (is (= y 0)))
    (let [{lines :lines {x :x y :y} :cursor} (-> vt (move-cursor 2 0) (feed inputs))]
      (is (= lines [[[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                    [[0x41 {}] [0x41 {}] [0x41 {}] [0x41 {}]]
                    [[0x42 {}] [0x42 {}] [0x42 {}] [0x42 {}]]]))
      (is (= x 2))
      (is (= y 0)))))

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
        (test-nel [ch])))

    (testing "0x0b (VT), 0x0c (FF), 0x84 (IND)"
      (doseq [ch [0x0b 0x0c 0x84]]
        (test-ind [ch])))

    (testing "0x0d (CR)"
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 0 1) (feed-one 0x0d))]
        (is (= x 0))
        (is (= y 1)))
      (let [{{x :x y :y} :cursor} (-> vt (move-cursor 2 1) (feed-one 0x0d))]
        (is (= x 0))
        (is (= y 1))))

    (testing "0x88 (HTS)"
      (test-hts [0x88]))

    (testing "0x8d (RI)"
      (test-ri [0x8d]))))

(deftest esc-sequence-test
  (testing "ESC D (IND)"
    (test-ind [0x1b 0x44]))

  (testing "ESC E (NEL)"
    (test-nel [0x1b 0x45]))

  (testing "ESC H (HTS)"
    (test-hts [0x1b 0x48]))

  (testing "ESC M (RI)"
    (test-ri [0x1b 0x4d]))

  (testing "ESC #8 (DECALN)"
    (let [vt (-> (make-vt 4 3)
                 (move-cursor 2 1)
                 (feed [0x1b 0x23 0x38]))
          {lines :lines {x :x y :y} :cursor} vt]
      (is (= lines [[[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]
                    [[0x45 {}] [0x45 {}] [0x45 {}] [0x45 {}]]]))
      (is (= x 2))
      (is (= y 1))))

  (testing "ESC 7 (SC)"
    (let [vt (-> (make-vt 4 3)
                 (move-cursor 2 1)
                 (feed [0x1b 0x37]))
          {{{x :x y :y} :cursor} :saved} vt]
      (is (= x 2))
      (is (= y 1))))

  (testing "ESC 8 (RC)"
    (let [vt (make-vt 4 3)]
      (let [vt (-> vt
                   (move-cursor 2 1)
                   (feed [0x1b 0x38]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 2 1)
                   (feed [0x1b 0x37])
                   (move-cursor 3 2)
                   (feed [0x1b 0x38]))
            {{x :x y :y} :cursor} vt]
        (is (= x 2))
        (is (= y 1)))))

  (testing "ESC c (RIS)"
    (let [initial-vt (make-vt 4 3)
          new-vt (-> initial-vt
                     (feed [0x41 0x42 0x1b 0x48]) ; print, set tab
                     (feed [0x1b 0x63]))] ; reset
      (is (= initial-vt new-vt)))))

(deftest control-sequence-test
  (testing "CSI @ (ICH)"
    (let [vt (-> (make-vt 5 3)
                 (feed [0x41 0x42 0x43 0x44])
                 (move-cursor 1 0))]
      (let [vt (feed vt [0x1b 0x5b 0x40])
            {{x :x y :y} :cursor [line0 & _] :lines} vt]
        (is (= x 1))
        (is (= y 0))
        (is (= line0 [[0x41 {}] [0x20 {}] [0x42 {}] [0x43 {}] [0x44 {}]])))
      (let [vt (feed vt [0x1b 0x5b 0x32 0x40])
            {{x :x y :y} :cursor [line0 & _] :lines} vt]
        (is (= x 1))
        (is (= y 0))
        (is (= line0 [[0x41 {}] [0x20 {}] [0x20 {}] [0x42 {}] [0x43 {}]])))))

  (testing "CSI A (CUU)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed [0x1b 0x5b 0x41]))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed [0x1b 0x5b 0x41]))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed [0x1b 0x5b 0x34 0x41]))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 0)))))

  (testing "CSI B (CUD)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed [0x1b 0x5b 0x42]))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed [0x1b 0x5b 0x42]))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 2)))
      (let [vt (-> vt
                   (move-cursor 1 1)
                   (feed [0x1b 0x5b 0x34 0x42]))
            {{x :x y :y} :cursor} vt]
        (is (= x 1))
        (is (= y 2)))))

  (testing "CSI C (CUF)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed [0x1b 0x5b 0x43]))
            {{x :x y :y} :cursor} vt]
        (is (= x 2))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 4 0)
                   (feed [0x1b 0x5b 0x43]))
            {{x :x y :y} :cursor} vt]
        (is (= x 4))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 2 1)
                   (feed [0x1b 0x5b 0x34 0x43]))
            {{x :x y :y} :cursor} vt]
        (is (= x 4))
        (is (= y 1)))))

  (testing "CSI D (CUB)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 3 0)
                   (feed [0x1b 0x5b 0x44]))
            {{x :x y :y} :cursor} vt]
        (is (= x 2))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 0 1)
                   (feed [0x1b 0x5b 0x44]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 2 1)
                   (feed [0x1b 0x5b 0x34 0x44]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))))

  (testing "CSI E (CNL)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed [0x1b 0x5b 0x45]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed [0x1b 0x5b 0x45]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 2)))
      (let [vt (-> vt
                   (move-cursor 1 1)
                   (feed [0x1b 0x5b 0x34 0x45]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 2)))))

  (testing "CSI F (CPL)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed [0x1b 0x5b 0x46]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 0)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed [0x1b 0x5b 0x46]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed [0x1b 0x5b 0x34 0x46]))
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 0)))))

  (testing "CSI G (CHA)"
    (let [vt (-> (make-vt 5 3)
                 (move-cursor 1 1))]
      (let [vt (feed vt [0x1b 0x5b 0x47])
            {{x :x y :y} :cursor} vt]
        (is (= x 0))
        (is (= y 1)))
      (let [vt (feed vt [0x1b 0x5b 0x33 0x47])
            {{x :x y :y} :cursor} vt]
        (is (= x 2))
        (is (= y 1)))
      (let [vt (feed vt [0x1b 0x5b 0x38 0x47])
            {{x :x y :y} :cursor} vt]
        (is (= x 4))
        (is (= y 1)))))

  (testing "CSI H (CUP), CSI f (HVP)"
    (let [vt (-> (make-vt 5 3)
                 (move-cursor 1 1))]
      (doseq [ch [0x48 0x66]]
        (let [vt (feed vt [0x1b 0x5b ch])
              {{x :x y :y} :cursor} vt]
          (is (= x 0))
          (is (= y 0)))
        (let [vt (feed vt [0x1b 0x5b 0x33 ch])
              {{x :x y :y} :cursor} vt]
          (is (= x 0))
          (is (= y 2)))
        (let [vt (feed vt [0x1b 0x5b 0x3b 0x33 ch])
              {{x :x y :y} :cursor} vt]
          (is (= x 2))
          (is (= y 0)))
        (let [vt (feed vt [0x1b 0x5b 0x33 0x3b 0x34 ch])
              {{x :x y :y} :cursor} vt]
          (is (= x 3))
          (is (= y 2)))
        (let [vt (feed vt [0x1b 0x5b 0x38 0x3b 0x38 ch])
              {{x :x y :y} :cursor} vt]
          (is (= x 4))
          (is (= y 2))))))

  (testing "CSI I (CHT)"
    (let [vt (-> (make-vt 80 3) (move-cursor 20 0))]
      (let [{{x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x49])]
        (is (= x 24))
        (is (= y 0)))
      (let [{{x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x33 0x49])]
        (is (= x 40))
        (is (= y 0)))))

  (testing "CSI J (ED)"
    (let [vt (-> (make-vt 4 3)
                 (feed [0x41 0x42 0x43 0x44
                        0x45 0x46 0x47 0x48
                        0x49 0x50])
                 (move-cursor 1 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x4a])]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x45 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 1))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x31 0x4a])]
        (is (= lines [[[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x47 {}] [0x48 {}]]
                      [[0x49 {}] [0x50 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 1))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x4a])]
        (is (= lines [[[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 1))
        (is (= y 1)))))

  (testing "CSI K (EL)"
    (let [vt (-> (make-vt 6 2)
                 (feed [0x41 0x42 0x43 0x44 0x45 0x46])
                 (move-cursor 3 0))]
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x4b])]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x43 {}] [0x20 {}] [0x20 {}] [0x20 {}]]))
        (is (= x 3))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x31 0x4b])]
        (is (= line0 [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}] [0x45 {}] [0x46 {}]]))
        (is (= x 3))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x4b])]
        (is (= line0 [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]))
        (is (= x 3))
        (is (= y 0)))))

  (testing "CSI L (IL)"
    (let [vt (-> (make-vt 4 4)
                 (feed [0x41 0x42 0x43 0x44
                        0x45 0x46 0x47 0x48
                        0x49 0x50])
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x4c])]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]
                      [[0x49 {}] [0x50 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x4c])]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI M (DL)"
    (let [vt (-> (make-vt 4 4)
                 (feed [0x41 0x42 0x43 0x44
                        0x45 0x46 0x47 0x48
                        0x49 0x50 0x51 0x52
                        0x53])
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x4d])]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x49 {}] [0x50 {}] [0x51 {}] [0x52 {}]]
                      [[0x53 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x4d])]
        (is (= lines [[[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x53 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI P (DCH)"
    (let [vt (-> (make-vt 7 1)
                 (feed [0x41 0x42 0x43 0x44 0x45 0x46])
                 (move-cursor 2 0))]
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x50])]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x44 {}] [0x45 {}] [0x46 {}] [0x20 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x50])]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x45 {}] [0x46 {}] [0x20 {}] [0x20 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))))

  (testing "CSI S (SU)"
    (let [vt (-> (make-vt 4 3)
                 (feed [0x41 0x42 0x43 0x44
                        0x45 0x46 0x47 0x48
                        0x49 0x50])
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x53])]
        (is (= lines [[[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]
                      [[0x49 {}] [0x50 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x53])]
        (is (= lines [[[0x49 {}] [0x50 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI T (SD)"
    (let [vt (-> (make-vt 4 3)
                 (feed [0x41 0x42 0x43 0x44
                        0x45 0x46 0x47 0x48
                        0x49 0x50])
                 (move-cursor 2 1))]
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x54])]
        (is (= lines [[[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]
                      [[0x45 {}] [0x46 {}] [0x47 {}] [0x48 {}]]]))
        (is (= x 2))
        (is (= y 1)))
      (let [{lines :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x54])]
        (is (= lines [[[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x20 {}] [0x20 {}] [0x20 {}] [0x20 {}]]
                      [[0x41 {}] [0x42 {}] [0x43 {}] [0x44 {}]]]))
        (is (= x 2))
        (is (= y 1)))))

  (testing "CSI X (ECH)"
    (let [vt (-> (make-vt 7 1)
                 (feed [0x41 0x42 0x43 0x44 0x45 0x46])
                 (move-cursor 2 0))]
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x58])]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x20 {}] [0x44 {}] [0x45 {}] [0x46 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))
      (let [{[line0 & _] :lines {x :x y :y} :cursor} (feed vt [0x1b 0x5b 0x32 0x58])]
        (is (= line0 [[0x41 {}] [0x42 {}] [0x20 {}] [0x20 {}] [0x45 {}] [0x46 {}] [0x20 {}]]))
        (is (= x 2))
        (is (= y 0)))))

  (testing "CSI g (TBC)"
    (let [vt (-> (make-vt 45 24)
                 (move-cursor 24 0))]
      (let [{:keys [tabs]} (feed vt [0x1b 0x5b 0x67])]
        (is (= tabs #{8 16 32 40})))
      (let [{:keys [tabs]} (feed vt [0x1b 0x5b 0x33 0x67])]
        (is (= tabs #{})))))

  (testing "CSI h (SM)"
    (let [vt (make-vt 4 3)]
      (let [{:keys [insert-mode]} (feed vt [0x1b 0x5b 0x34 0x68])]
        (is (= insert-mode true)))))

  (testing "CSI l (RM)"
    (let [vt (make-vt 4 3)]
      (let [{:keys [insert-mode]} (feed vt [0x1b 0x5b 0x34 0x6c])]
        (is (= insert-mode false))))))

(deftest get-params-test
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser :param-chars] []))]
    (is (= (get-params vt) [])))
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser :param-chars] [0x33]))]
    (is (= (get-params vt) [3])))
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser :param-chars] [0x3b 0x3b 0x31 0x32 0x3b 0x3b 0x32 0x33 0x3b 0x31 0x3b]))]
    (is (= (get-params vt) [0 0 12 0 23 1]))))

(defspec feeding-rubbish
  100
  (let [vt (make-vt 80 24)]
    (prop/for-all [rubbish (gen/vector (gen/choose 0 0x7f) 1 100)]
                  (not= nil (-> vt (feed rubbish) :parser :state)))))
