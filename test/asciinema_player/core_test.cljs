(ns asciinema-player.core-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema-player.core :as c]))

(deftest new-position-test
  (is (= (c/new-position 2 5 -3) 0))
  (is (= (c/new-position 2 5 -1) 1))
  (is (= (c/new-position 2 5 4) 5))
  (is (= (c/new-position 2 5 2) 4)))
