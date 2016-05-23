(ns asciinema.player.view-test
  (:require-macros [cljs.test :refer (is are deftest testing)])
  (:require [cljs.test]
            [asciinema.player.view :as v]))

(deftest test-color-class-name
  (are [color high-intensity class] (= (v/color-class-name color high-intensity "c-") class)
    nil false nil
    nil true nil
    [1 101 201] false nil
    1 false "c-1"
    1 true "c-9"
    7 true "c-15"
    8 true "c-8"
    15 true "c-15"))

(deftest test-part-props
  (are [attrs props] (= (v/part-props attrs) props)
    {} nil
    {:fg 1} {:class-name "fg-1"}
    {:fg [1 2 3]} {:style {:color "rgb(1,2,3)"}}
    {:bg 2} {:class-name "bg-2"}
    {:bg [4 5 6]} {:style {:background-color "rgb(4,5,6)"}}
    {:fg 1 :bold true} {:class-name "fg-9 bright"}
    {:fg 9 :bold true} {:class-name "fg-9 bright"}
    {:fg 1 :bg 2 :underline true} {:class-name "fg-1 bg-2 underline"}
    {:fg [1 2 3] :bg [4 5 6] :bold true :underline true} {:class-name "bright underline" :style {:color "rgb(1,2,3)" :background-color "rgb(4,5,6)"}}
    ;; inversed colors
    {:inverse true} {:class-name "fg-bg bg-fg"}
    {:inverse true :fg 1} {:class-name "fg-bg bg-1"}
    {:inverse true :fg [1 2 3]} {:class-name "fg-bg" :style {:background-color "rgb(1,2,3)"}}
    {:inverse true :bg 2} {:class-name "fg-2 bg-fg"}
    {:inverse true :bg [4 5 6]} {:class-name "bg-fg" :style {:color "rgb(4,5,6)"}}
    {:inverse true :fg 1 :bg 2} {:class-name "fg-2 bg-1"}
    {:inverse true :fg 1 :bg 2 :bold true :blink true} {:class-name "fg-10 bg-9 bright"}
    {:inverse true :fg [1 2 3] :bg [4 5 6]} {:style {:color "rgb(4,5,6)" :background-color "rgb(1,2,3)"}}))

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
