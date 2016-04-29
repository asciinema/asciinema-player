(ns asciinema.player.core-test
  (:require-macros [cljs.test :refer (is deftest testing)])
  (:require [cljs.test]
            [asciinema.player.view :as view]
            [asciinema.player.core :as c]))

(deftest make-player-test
  (let [make-player #(c/make-player "https://..." %)]
    (let [player (make-player {})]
      (is (some? (:source player)))
      (is (= (:width player) nil))
      (is (= (:height player) nil))
      (is (= (:duration player) nil))
      (is (= (:current-time player) 0))
      (is (= (:theme player) "asciinema"))
      (is (= (:font-size player) "small"))
      (is (= (:speed player) 1)))
    (let [player (make-player {:width 100 :height 40 :speed 3 :theme "tango" :font-size "big" :loop true :auto-play true :author "me"})]
      (is (= (:width player) 100))
      (is (= (:height player) 40))
      (is (= (:speed player) 3))
      (is (= (:theme player) "tango"))
      (is (= (:font-size player) "big"))
      (is (= (:author player) "me")))
    (let [player (make-player {:start-at 15})]
      (is (= (:current-time player) 15)))
    (let [player (make-player {:start-at "1:15"})]
      (is (= (:current-time player) 75)))
    (let [player (make-player {:poster [[["foo" {}] ["bar" {:fg 1}]] [["baz" {:bg 2}]]]})]
      (is (= (-> player :poster :lines) [[["foo" {}] ["bar" {:fg 1}]] [["baz" {:bg 2}]]])))))

(deftest parse-npt-test
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
        text "foo\n\rbar\u001b[31mbaz"
        text-poster (str "data:text/plain," text)]
    (is (= (c/parse-poster nil 8 2) nil))
    (is (= (c/parse-poster poster 8 2) {:lines poster}))
    (is (= (c/parse-poster base64-poster 8 2) {:lines poster}))
    (let [p (c/parse-poster text-poster 8 2)]
      (is (= (view/lines p) [[["foo     " {}]]
                             [["bar" {}] ["baz" {:fg 1}] ["  " {}]]]))
      (is (= (view/cursor p) {:x 6 :y 1 :visible true})))))

(deftest new-start-at-test
  (is (= (c/new-start-at 2 5 -3) 0))
  (is (= (c/new-start-at 2 5 -1) 1))
  (is (= (c/new-start-at 2 5 4) 5))
  (is (= (c/new-start-at 2 5 2) 4)))
