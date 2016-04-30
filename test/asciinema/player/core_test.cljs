(ns asciinema.player.core-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema.player.view :as view]
            [asciinema.player.core :as c]))

(deftest test-make-player
  (let [make-player #(c/make-player "https://..." %)]
    (testing "defaults"
      (let [player (make-player {})
            source (:source player)]
        (is (nil? (:width player)))
        (is (nil? (:height player)))
        (is (= (:speed player) 1))
        (is (nil? (:duration player)))
        (is (zero? (:current-time player)))
        (is (= (:theme player) "asciinema"))
        (is (= (:font-size player) "small"))
        (is (= (:url source) "https://..."))
        (is (= (:speed source) 1))
        (is (zero? (:start-at source)))
        (is (false? (:auto-play? source)))
        (is (false? (:loop? source)))
        (is (false? (:preload? source)))
        (is (nil? (:poster-time source)))))
    (testing "setting options"
      (let [player (make-player {:width 100
                                 :height 40
                                 :speed 3
                                 :theme "tango"
                                 :font-size "big"
                                 :loop true
                                 :auto-play true
                                 :author "me"})
            source (:source player)]
        (is (= (:width player) 100))
        (is (= (:height player) 40))
        (is (= (:speed player) 3))
        (is (= (:theme player) "tango"))
        (is (= (:font-size player) "big"))
        (is (= (:author player) "me"))
        (is (= (:speed source) 3))
        (is (true? (:auto-play? source)))
        (is (true? (:loop? source)))))
    (testing "start-at and poster"
      (let [player (make-player {:start-at 0})
            source (:source player)]
        (is (= (:current-time player) 0))
        (is (= (:start-at source) 0))
        (is (= (:poster-time source) nil)))
      (let [player (make-player {:start-at 15})
            source (:source player)]
        (is (= (:current-time player) 15))
        (is (= (:start-at source) 15))
        (is (= (:poster-time source) 15)))
      (let [player (make-player {:start-at 15 :poster "npt:16"})
            source (:source player)]
        (is (= (:current-time player) 15))
        (is (= (:start-at source) 15))
        (is (= (:poster-time source) 16)))
      (let [player (make-player {:start-at 5
                                 :poster [[["foo" {}] ["bar" {:fg 1}]]
                                          [["baz" {:bg 2}]]]})]
        (is (= (-> player :screen :lines) [[["foo" {}] ["bar" {:fg 1}]]
                                           [["baz" {:bg 2}]]]))))))

(deftest test-parse-npt
  (is (= (c/parse-npt nil) nil))
  (is (= (c/parse-npt 123.5) 123.5))
  (is (= (c/parse-npt "123.5") 123.5))
  (is (= (c/parse-npt "2:4") 124))
  (is (= (c/parse-npt "02:04") 124))
  (is (= (c/parse-npt "2:04.5") 124.5))
  (is (= (c/parse-npt "1:2:35") 3755))
  (is (= (c/parse-npt "01:02:35.5") 3755.5)))

(deftest parse-poster-test
  (let [poster [[["foo" {:fg 1}]] [["bar" {:bg 2}]]]
        base64-data (-> poster clj->js js/JSON.stringify js/btoa)
        base64-poster (str "data:application/json;base64," base64-data)
        text-poster (str "data:text/plain,foo\n\rbar\u001b[31mbaz")]
    (testing "no poster"
      (is (= (c/parse-poster nil 8 2) nil)))
    (testing "NPT poster"
      (is (= (c/parse-poster "npt:2:34" 8 2) {:time 154})))
    (testing "array poster"
      (is (= (c/parse-poster poster 8 2) {:screen {:lines poster}})))
    (testing "base64 array poster"
      (is (= (c/parse-poster base64-poster 8 2) {:screen {:lines poster}})))
    (testing "text poster"
      (let [{:keys [screen]} (c/parse-poster text-poster 8 2)]
        (is (= (view/lines screen) [[["foo     " {}]]
                                    [["bar" {}] ["baz" {:fg 1}] ["  " {}]]]))
        (is (= (view/cursor screen) {:x 6 :y 1 :visible true}))))))

(deftest new-start-at-test
  (is (= (c/new-start-at 2 5 -3) 0))
  (is (= (c/new-start-at 2 5 -1) 1))
  (is (= (c/new-start-at 2 5 4) 5))
  (is (= (c/new-start-at 2 5 2) 4)))
