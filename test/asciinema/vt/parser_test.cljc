(ns asciinema.vt.parser-test
  #?(:cljs (:require-macros [cljs.test :refer [is are deftest testing]]))
  (:require #?(:clj [clojure.test :refer [is are deftest testing]])
            [asciinema.vt.parser :as parser :refer [parse]]))

(defn test-event [initial-state input expected-state expected-actions]
  (is (= (parse initial-state input) [expected-state expected-actions])))

(defn test-high-events
  ([initial-state] (test-high-events initial-state []))
  ([initial-state exit-actions]
   (doseq [input (range 0x80 (inc 0x8f))]
     (test-event initial-state input :ground (concat exit-actions [:execute])))

   (test-event initial-state 0x90 :dcs-entry (concat exit-actions [:clear]))

   (doseq [input (range 0x91 (inc 0x97))]
     (test-event initial-state input :ground (concat exit-actions [:execute])))

   (test-event initial-state 0x98 :sos-pm-apc-string exit-actions)

   (doseq [input (range 0x99 (inc 0x9a))]
     (test-event initial-state input :ground (concat exit-actions [:execute])))

   (test-event initial-state 0x9b :csi-entry (concat exit-actions [:clear]))
   (test-event initial-state 0x9c :ground exit-actions)
   (test-event initial-state 0x9d :osc-string (concat exit-actions [:osc-start]))
   (test-event initial-state 0x9e :sos-pm-apc-string exit-actions)
   (test-event initial-state 0x9f :sos-pm-apc-string exit-actions)))

(deftest parse-test
  (testing "all"
    (doseq [state (keys parser/states)
            input (range (inc 0x9f))]
      (is (not= (parse state input) nil))))

  (testing "ground"
    (doseq [input (range 0x00 (inc 0x1a))]
      (test-event :ground input :ground [:execute]))

    (test-event :ground 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :ground input :ground [:execute]))

    (doseq [input (range 0x20 (inc 0x7f))]
      (test-event :ground input :ground [:print]))

    (test-high-events :ground))

  (testing "escape"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :escape input :escape [:execute]))

    (test-event :escape 0x18 :ground [:execute])
    (test-event :escape 0x19 :escape [:execute])

    (test-event :escape 0x1a :ground [:execute])
    (test-event :escape 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :escape input :escape [:execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :escape input :escape-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x4f))]
      (test-event :escape input :ground [:esc-dispatch]))

    (test-event :escape 0x50 :dcs-entry [:clear])

    (doseq [input (range 0x51 (inc 0x57))]
      (test-event :escape input :ground [:esc-dispatch]))

    (test-event :escape 0x58 :sos-pm-apc-string [])
    (test-event :escape 0x59 :ground [:esc-dispatch])
    (test-event :escape 0x5a :ground [:esc-dispatch])
    (test-event :escape 0x5b :csi-entry [:clear])
    (test-event :escape 0x5c :ground [:esc-dispatch])
    (test-event :escape 0x5d :osc-string [:osc-start])
    (test-event :escape 0x5e :sos-pm-apc-string [])
    (test-event :escape 0x5f :sos-pm-apc-string [])

    (doseq [input (range 0x60 (inc 0x7e))]
      (test-event :escape input :ground [:esc-dispatch]))

    (test-event :escape 0x7f :escape [:ignore])

    (test-high-events :escape))

  (testing "escape-intermediate"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :escape-intermediate input :escape-intermediate [:execute]))

    (test-event :escape-intermediate 0x18 :ground [:execute])
    (test-event :escape-intermediate 0x19 :escape-intermediate [:execute])
    (test-event :escape-intermediate 0x1a :ground [:execute])
    (test-event :escape-intermediate 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :escape-intermediate input :escape-intermediate [:execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :escape-intermediate input :escape-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x7e))]
      (test-event :escape-intermediate input :ground [:esc-dispatch]))

    (test-event :escape-intermediate 0x7f :escape-intermediate [:ignore])

    (test-high-events :escape-intermediate))

  (testing "csi-entry"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-entry input :csi-entry [:execute]))

    (test-event :csi-entry 0x18 :ground [:execute])
    (test-event :csi-entry 0x19 :csi-entry [:execute])
    (test-event :csi-entry 0x1a :ground [:execute])
    (test-event :csi-entry 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-entry input :csi-entry [:execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :csi-entry input :csi-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :csi-entry input :csi-param [:param]))

    (test-event :csi-entry 0x3a :csi-ignore [])
    (test-event :csi-entry 0x3b :csi-param [:param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :csi-entry input :csi-param [:collect]))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-entry input :ground [:csi-dispatch]))

    (test-event :csi-entry 0x7f :csi-entry [:ignore])

    (test-high-events :csi-entry))

  (testing "csi-param"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-param input :csi-param [:execute]))

    (test-event :csi-param 0x18 :ground [:execute])
    (test-event :csi-param 0x19 :csi-param [:execute])
    (test-event :csi-param 0x1a :ground [:execute])
    (test-event :csi-param 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-param input :csi-param [:execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :csi-param input :csi-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :csi-param input :csi-param [:param]))

    (test-event :csi-param 0x3a :csi-ignore [])
    (test-event :csi-param 0x3b :csi-param [:param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :csi-param input :csi-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-param input :ground [:csi-dispatch]))

    (test-event :csi-param 0x7f :csi-param [:ignore])

    (test-high-events :csi-param))

  (testing "csi-intermediate"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-intermediate input :csi-intermediate [:execute]))

    (test-event :csi-intermediate 0x18 :ground [:execute])
    (test-event :csi-intermediate 0x19 :csi-intermediate [:execute])
    (test-event :csi-intermediate 0x1a :ground [:execute])
    (test-event :csi-intermediate 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-intermediate input :csi-intermediate [:execute]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :csi-intermediate input :csi-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x3f))]
      (test-event :csi-intermediate input :csi-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-intermediate input :ground [:csi-dispatch]))

    (test-event :csi-intermediate 0x7f :csi-intermediate [:ignore])

    (test-high-events :csi-intermediate))

  (testing "csi-ignore"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :csi-ignore input :csi-ignore [:execute]))

    (test-event :csi-ignore 0x18 :ground [:execute])
    (test-event :csi-ignore 0x19 :csi-ignore [:execute])
    (test-event :csi-ignore 0x1a :ground [:execute])
    (test-event :csi-ignore 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :csi-ignore input :csi-ignore [:execute]))

    (doseq [input (range 0x20 (inc 0x3f))]
      (test-event :csi-ignore input :csi-ignore [:ignore]))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :csi-ignore input :ground []))

    (test-event :csi-ignore 0x7f :csi-ignore [:ignore])

    (test-high-events :csi-ignore))

  (testing "dcs-entry"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-entry input :dcs-entry [:ignore]))

    (test-event :dcs-entry 0x18 :ground [:execute])
    (test-event :dcs-entry 0x19 :dcs-entry [:ignore])
    (test-event :dcs-entry 0x1a :ground [:execute])
    (test-event :dcs-entry 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :dcs-entry input :dcs-entry [:ignore]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :dcs-entry input :dcs-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :dcs-entry input :dcs-param [:param]))

    (test-event :dcs-entry 0x3a :dcs-ignore [])
    (test-event :dcs-entry 0x3b :dcs-param [:param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :dcs-entry input :dcs-param [:collect]))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :dcs-entry input :dcs-passthrough [:hook]))

    (test-event :dcs-entry 0x7f :dcs-entry [:ignore])

    (test-high-events :dcs-entry))

  (testing "dcs-param"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-param input :dcs-param [:ignore]))

    (test-event :dcs-param 0x18 :ground [:execute])
    (test-event :dcs-param 0x19 :dcs-param [:ignore])
    (test-event :dcs-param 0x1a :ground [:execute])
    (test-event :dcs-param 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :dcs-param input :dcs-param [:ignore]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :dcs-param input :dcs-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x39))]
      (test-event :dcs-param input :dcs-param [:param]))

    (test-event :dcs-param 0x3a :dcs-ignore [])
    (test-event :dcs-param 0x3b :dcs-param [:param])

    (doseq [input (range 0x3c (inc 0x3f))]
      (test-event :dcs-param input :dcs-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :dcs-param input :dcs-passthrough [:hook]))

    (test-event :dcs-param 0x7f :dcs-param [:ignore])

    (test-high-events :dcs-param))

  (testing "dcs-intermediate"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-intermediate input :dcs-intermediate [:ignore]))

    (test-event :dcs-intermediate 0x18 :ground [:execute])
    (test-event :dcs-intermediate 0x19 :dcs-intermediate [:ignore])
    (test-event :dcs-intermediate 0x1a :ground [:execute])
    (test-event :dcs-intermediate 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :dcs-intermediate input :dcs-intermediate [:ignore]))

    (doseq [input (range 0x20 (inc 0x2f))]
      (test-event :dcs-intermediate input :dcs-intermediate [:collect]))

    (doseq [input (range 0x30 (inc 0x3f))]
      (test-event :dcs-intermediate input :dcs-ignore []))

    (doseq [input (range 0x40 (inc 0x7e))]
      (test-event :dcs-intermediate input :dcs-passthrough [:hook]))

    (test-event :dcs-intermediate 0x7f :dcs-intermediate [:ignore])

    (test-high-events :dcs-intermediate))

  (testing "dcs-passthrough"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-passthrough input :dcs-passthrough [:put]))

    (test-event :dcs-passthrough 0x18 :ground [:unhook :execute])
    (test-event :dcs-passthrough 0x19 :dcs-passthrough [:put])
    (test-event :dcs-passthrough 0x1a :ground [:unhook :execute])
    (test-event :dcs-passthrough 0x1b :escape [:unhook :clear])

    (doseq [input (range 0x1c (inc 0x7e))]
      (test-event :dcs-passthrough input :dcs-passthrough [:put]))

    (test-event :dcs-passthrough 0x7f :dcs-passthrough [:ignore])

    (test-high-events :dcs-passthrough [:unhook]))

  (testing "dcs-ignore"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :dcs-ignore input :dcs-ignore [:ignore]))

    (test-event :dcs-ignore 0x18 :ground [:execute])
    (test-event :dcs-ignore 0x19 :dcs-ignore [:ignore])
    (test-event :dcs-ignore 0x1a :ground [:execute])
    (test-event :dcs-ignore 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x7f))]
      (test-event :dcs-ignore input :dcs-ignore [:ignore]))

    (test-high-events :dcs-ignore))

  (testing "osc-string"
    (doseq [input (range 0x00 (inc 0x06))]
      (test-event :osc-string input :osc-string [:ignore]))

    (test-event :osc-string 0x07 :ground [:osc-end])

    (doseq [input (range 0x08 (inc 0x17))]
      (test-event :osc-string input :osc-string [:ignore]))

    (test-event :osc-string 0x18 :ground [:osc-end :execute])
    (test-event :osc-string 0x19 :osc-string [:ignore])
    (test-event :osc-string 0x1a :ground [:osc-end :execute])
    (test-event :osc-string 0x1b :escape [:osc-end :clear])

    (doseq [input (range 0x1c (inc 0x1f))]
      (test-event :osc-string input :osc-string [:ignore]))

    (doseq [input (range 0x20 (inc 0x7f))]
      (test-event :osc-string input :osc-string [:osc-put]))

    (test-high-events :osc-string [:osc-end]))

  (testing "sos-pm-apc-string"
    (doseq [input (range 0x00 (inc 0x17))]
      (test-event :sos-pm-apc-string input :sos-pm-apc-string [:ignore]))

    (test-event :sos-pm-apc-string 0x18 :ground [:execute])
    (test-event :sos-pm-apc-string 0x19 :sos-pm-apc-string [:ignore])
    (test-event :sos-pm-apc-string 0x1a :ground [:execute])
    (test-event :sos-pm-apc-string 0x1b :escape [:clear])

    (doseq [input (range 0x1c (inc 0x7f))]
      (test-event :sos-pm-apc-string input :sos-pm-apc-string [:ignore]))

    (test-high-events :sos-pm-apc-string)))
