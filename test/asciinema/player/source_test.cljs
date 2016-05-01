(ns asciinema.player.source-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema.player.source :as s]))

(deftest initialize-asciicast-test
  (testing "pre v1 format"
    (let [asciicast [[1.0 {:lines {0 [["foo" {}] ["bar" {}]] 1 [["foobar" {}]]}}]
                     [2.0 {:lines {0 [["baz" {}] ["qux" {}]] 1 [["quuuux" {}]]}}]]
          asciicast (s/initialize-asciicast asciicast)]
      (is (= (select-keys asciicast [:width :height :duration])
             {:width 6 :height 2 :duration 3.0}))))

  (testing "v1 format"
    (let [asciicast {:version 1 :width 80 :height 24 :stdout [[1.0 "foo"] [2.0 "bar"]]}
          asciicast (s/initialize-asciicast asciicast)]
      (is (= (select-keys asciicast [:width :height :duration])
             {:width 80 :height 24 :duration 3.0})))))

(deftest screen-state-at-test
  (let [frames [[5 :foo] [3 :bar] [4 :baz]]]
    (is (= (s/screen-state-at frames 0) nil))
    (is (= (s/screen-state-at frames 1) nil))
    (is (= (s/screen-state-at frames 2) nil))
    (is (= (s/screen-state-at frames 3) nil))
    (is (= (s/screen-state-at frames 4) nil))
    (is (= (s/screen-state-at frames 5) :foo))
    (is (= (s/screen-state-at frames 6) :foo))
    (is (= (s/screen-state-at frames 7) :foo))
    (is (= (s/screen-state-at frames 8) :bar))
    (is (= (s/screen-state-at frames 9) :bar))
    (is (= (s/screen-state-at frames 10) :bar))
    (is (= (s/screen-state-at frames 11) :bar))
    (is (= (s/screen-state-at frames 12) :baz))
    (is (= (s/screen-state-at frames 13) :baz))))

(deftest drop-frames-test
  (let [frames [[2 :a] [4 :b] [6 :c]]]
    (is (= (s/drop-frames frames 0) [[2 :a] [4 :b] [6 :c]]))
    (is (= (s/drop-frames frames 1) [[1 :a] [4 :b] [6 :c]]))
    (is (= (s/drop-frames frames 2) [[0 :a] [4 :b] [6 :c]]))
    (is (= (s/drop-frames frames 3) [[3 :b] [6 :c]]))
    (is (= (s/drop-frames frames 4) [[2 :b] [6 :c]]))
    (is (= (s/drop-frames frames 5) [[1 :b] [6 :c]]))
    (is (= (s/drop-frames frames 6) [[0 :b] [6 :c]]))
    (is (= (s/drop-frames frames 11) [[1 :c]]))
    (is (= (s/drop-frames frames 12) [[0 :c]]))
    (is (= (s/drop-frames frames 13) []))))
