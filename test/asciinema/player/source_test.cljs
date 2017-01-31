(ns asciinema.player.source-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema.player.source :as s]))

(deftest initialize-asciicast-test
  (testing "pre v1 format"
    (let [asciicast [[1.0 {:lines {:0 [["foo" {}] ["bar" {}]] :1 [["foobar" {}]]}}]
                     [2.0 {:lines {:0 [["baz" {}] ["qux" {}]] :1 [["quuuux" {}]]}}]]
          asciicast (s/initialize-asciicast asciicast)]
      (is (= (select-keys asciicast [:width :height :duration])
             {:width 6 :height 2 :duration 3.0}))))

  (testing "v1 format"
    (let [asciicast {:version 1 :width 80 :height 24 :stdout [[1.0 "foo"] [2.0 "bar"]]}
          asciicast (s/initialize-asciicast asciicast)]
      (is (= (select-keys asciicast [:width :height :duration])
             {:width 80 :height 24 :duration 3.0})))))
