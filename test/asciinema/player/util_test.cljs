(ns asciinema.player.util-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema.player.util :as u]))

(deftest adjust-to-range-test
  (is (= (u/adjust-to-range 1 -5 5) 1))
  (is (= (u/adjust-to-range -6 -5 5) -5))
  (is (= (u/adjust-to-range 6 -5 5) 5)))
