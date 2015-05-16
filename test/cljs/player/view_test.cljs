(ns player.view-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [player.view :as v]))

(deftest fg-color-test
  (is (= (v/fg-color nil false) nil))
  (is (= (v/fg-color nil true) nil))
  (is (= (v/fg-color 1 false) 1))
  (is (= (v/fg-color 1 true) 9))
  (is (= (v/fg-color 7 true) 15))
  (is (= (v/fg-color 8 true) 8))
  (is (= (v/fg-color 15 true) 15)))

(deftest bg-color-test
  (is (= (v/bg-color nil false) nil))
  (is (= (v/bg-color nil true) nil))
  (is (= (v/bg-color 1 false) 1))
  (is (= (v/bg-color 1 true) 9))
  (is (= (v/bg-color 7 true) 15))
  (is (= (v/bg-color 8 true) 8))
  (is (= (v/bg-color 15 true) 15)))

(deftest part-class-name-test
  (is (= (v/part-class-name {}) ""))
  (is (= (v/part-class-name {:fg 1}) "fg-1"))
  (is (= (v/part-class-name {:bg 2}) "bg-2"))
  (is (= (v/part-class-name {:fg 1 :bold true}) "fg-9 bright"))
  (is (= (v/part-class-name {:fg 9 :bold true}) "fg-9 bright"))
  (is (= (v/part-class-name {:fg 1 :bg 2 :underline true}) "fg-1 bg-2 underline"))
  (is (= (v/part-class-name {:inverse true}) "fg-bg bg-fg"))
  (is (= (v/part-class-name {:fg 1 :inverse true}) "fg-bg bg-1"))
  (is (= (v/part-class-name {:bg 2 :inverse true}) "fg-2 bg-fg"))
  (is (= (v/part-class-name {:fg 1 :bg 2 :inverse true}) "fg-2 bg-1"))
  (is (= (v/part-class-name {:fg 1 :bg 2 :bold true :blink true :inverse true}) "fg-10 bg-9 bright")))

(deftest format-time-test
  (is (= (v/format-time 0.88) "00:00"))
  (is (= (v/format-time 1.00) "00:01"))
  (is (= (v/format-time 133.95) "02:13")))
