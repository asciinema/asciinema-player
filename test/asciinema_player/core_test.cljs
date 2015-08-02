(ns asciinema-player.core-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema-player.core :as c]))

(deftest apply-changes-test
  (let [state {:lines {} :cursor {}}
        changes {:lines {1 :b 3 :d} :cursor {:x 1 :y 2 :visible true} :unknown true}]
    (is (= (c/apply-changes state changes) {:lines {1 :b 3 :d} :cursor {:x 1 :y 2 :visible true}}))
    (let [state {:lines {0 :a 1 :bb} :cursor {:x 0 :visible false}}]
      (is (= (c/apply-changes state changes) {:lines {0 :a 1 :b 3 :d} :cursor {:x 1 :y 2 :visible true}})))))

(deftest new-position-test
  (is (= (c/new-position 2 5 -3) 0.0))
  (is (= (c/new-position 2 5 -1) 0.2))
  (is (= (c/new-position 2 5 4) 1.0))
  (is (= (c/new-position 2 5 2) 0.8)))

(deftest prev-changes-test
  (let [frames [[5 {:lines {:a 1 :b 2} :cursor {:x 1 :y 2 :visible true}}] [3 {:lines {:b 22}}] [4 {:lines {:c 3} :cursor {:y 3 :visible false}}]]]
    (is (= (c/prev-changes frames 0) nil))
    (is (= (c/prev-changes frames 1) nil))
    (is (= (c/prev-changes frames 2) nil))
    (is (= (c/prev-changes frames 3) nil))
    (is (= (c/prev-changes frames 4) nil))
    (is (= (c/prev-changes frames 5) {:lines {:a 1 :b 2} :cursor {:x 1 :y 2 :visible true}}))
    (is (= (c/prev-changes frames 6) {:lines {:a 1 :b 2} :cursor {:x 1 :y 2 :visible true}}))
    (is (= (c/prev-changes frames 7) {:lines {:a 1 :b 2} :cursor {:x 1 :y 2 :visible true}}))
    (is (= (c/prev-changes frames 8) {:lines {:a 1 :b 22} :cursor {:x 1 :y 2 :visible true}}))
    (is (= (c/prev-changes frames 9) {:lines {:a 1 :b 22} :cursor {:x 1 :y 2 :visible true}}))
    (is (= (c/prev-changes frames 10) {:lines {:a 1 :b 22} :cursor {:x 1 :y 2 :visible true}}))
    (is (= (c/prev-changes frames 11) {:lines {:a 1 :b 22} :cursor {:x 1 :y 2 :visible true}}))
    (is (= (c/prev-changes frames 12) {:lines {:a 1 :b 22 :c 3} :cursor {:x 1 :y 3 :visible false}}))
    (is (= (c/prev-changes frames 13) {:lines {:a 1 :b 22 :c 3} :cursor {:x 1 :y 3 :visible false}}))))

(deftest next-frames-test
  (let [frames [[2 :a] [4 :b] [6 :c]]]
    (is (= (c/next-frames frames 0) [[2 :a] [4 :b] [6 :c]]))
    (is (= (c/next-frames frames 1) [[1 :a] [4 :b] [6 :c]]))
    (is (= (c/next-frames frames 2) [[4 :b] [6 :c]]))
    (is (= (c/next-frames frames 3) [[3 :b] [6 :c]]))
    (is (= (c/next-frames frames 4) [[2 :b] [6 :c]]))
    (is (= (c/next-frames frames 5) [[1 :b] [6 :c]]))
    (is (= (c/next-frames frames 6) [[6 :c]]))
    (is (= (c/next-frames frames 11) [[1 :c]]))
    (is (= (c/next-frames frames 12) []))
    (is (= (c/next-frames frames 13) []))))
