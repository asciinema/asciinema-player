(ns asciinema-player.view-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema-player.view :as v]))

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
  (is (= (v/part-class-name {} false) ""))
  (is (= (v/part-class-name {:fg 1} false) "fg-1"))
  (is (= (v/part-class-name {:bg 2} false) "bg-2"))
  (is (= (v/part-class-name {:fg 1 :bold true} false) "fg-9 bright"))
  (is (= (v/part-class-name {:fg 9 :bold true} false) "fg-9 bright"))
  (is (= (v/part-class-name {:fg 1 :bg 2 :underline true} false) "fg-1 bg-2 underline"))
  (is (= (v/part-class-name {:inverse true} false) "fg-bg bg-fg"))
  (is (= (v/part-class-name {:fg 1 :inverse true} false) "fg-bg bg-1"))
  (is (= (v/part-class-name {:bg 2 :inverse true} false) "fg-2 bg-fg"))
  (is (= (v/part-class-name {:fg 1 :bg 2 :inverse true} false) "fg-2 bg-1"))
  (is (= (v/part-class-name {:fg 1 :bg 2 :bold true :blink true :inverse true} false) "fg-10 bg-9 bright")))

(deftest elapsed-time-test
  (is (= (v/elapsed-time 0.88) "00:00"))
  (is (= (v/elapsed-time 1.00) "00:01"))
  (is (= (v/elapsed-time 133.95) "02:13")))

(deftest remaining-time-test
  (is (= (v/remaining-time 0.88 3) "-00:02"))
  (is (= (v/remaining-time 1.00 3) "-00:02"))
  (is (= (v/remaining-time 133.95 134) "-00:00")))

(deftest insert-cursor-test
  (is (= (v/insert-cursor [["foo" {:foo true}] ["bar" {:bar true}]] 0) [["f" {:foo true :cursor true}] ["oo" {:foo true}] ["bar" {:bar true}]]))
  (is (= (v/insert-cursor [["foo" {:foo true}] ["bar" {:bar true}]] 1) [["f" {:foo true}] ["o" {:foo true :cursor true}] ["o" {:foo true}] ["bar" {:bar true}]]))
  (is (= (v/insert-cursor [["foo" {:foo true}] ["bar" {:bar true}]] 2) [["fo" {:foo true}] ["o" {:foo true :cursor true}] ["bar" {:bar true}]]))
  (is (= (v/insert-cursor [["foo" {:foo true}] ["bar" {:bar true}]] 5) [["foo" {:foo true}] ["ba" {:bar true}] ["r" {:bar true :cursor true}]]))
  (is (= (v/insert-cursor [["f" {:foo true}] ["bar" {:bar true}]] 0) [["f" {:foo true :cursor true}] ["bar" {:bar true}]]))
  (is (= (v/insert-cursor [["foo" {:foo true}] ["b" {:bar true}]] 3) [["foo" {:foo true}] ["b" {:bar true :cursor true}]]))
  (is (= (v/insert-cursor [["foo" {:foo true}] ["b" {:bar true}] ["qux" {:qux true}]] 3) [["foo" {:foo true}] ["b" {:bar true :cursor true}] ["qux" {:qux true}]]))
  (is (= (v/insert-cursor [["foo" {:foo true}] ["bar" {:bar true}] ["baz" {:baz true}]] 9) [["foo" {:foo true}] ["bar" {:bar true}] ["baz" {:baz true}]]))
  (is (= (v/insert-cursor [["foo" {:foo true}] ["bar" {:bar true}] ["baz" {:baz true}]] 10) [["foo" {:foo true}] ["bar" {:bar true}] ["baz" {:baz true}]]))
  (is (= (v/insert-cursor [] 0) []))
  (is (= (v/insert-cursor [] 1) [])))
