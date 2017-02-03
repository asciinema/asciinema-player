(ns asciinema.vt-test
  #?(:cljs (:require-macros [cljs.test :refer [is are deftest testing]]
                            [clojure.test.check.clojure-test :refer [defspec]]
                            [asciinema.player.test-macros :refer [property-tests-multiplier expect-lines expect-first-line expect-tabs expect-cursor]]))
  (:require #?(:clj [clojure.test :refer [is are deftest testing use-fixtures]]
               :cljs [cljs.test :refer-macros [use-fixtures]])
            [clojure.test.check :as tc]
            [clojure.test.check.generators :as gen]
            [clojure.test.check.properties :as prop #?@(:cljs [:include-macros true])]
            #?(:clj [clojure.test.check.clojure-test :refer [defspec]])
            [schema.test]
            #?(:clj [asciinema.player.test-macros :refer [property-tests-multiplier expect-lines expect-first-line expect-tabs expect-cursor]])
            [asciinema.vt :as vt :refer [make-vt feed feed-one feed-str get-params dump-sgr dump]]
            [asciinema.vt.screen :as screen]))

(use-fixtures :once schema.test/validate-schemas)

(def vt-80x24 (make-vt 80 24))

(deftest make-vt-test
  (let [vt (make-vt 80 24)]
    (is (= (-> vt :parser-intermediates) []))
    (is (= (-> vt :parser-params) []))
    (is (= (-> vt :screen :tabs) #{8 16 24 32 40 48 56 64 72}))
    (is (= (-> vt :screen :char-attrs) screen/normal-char-attrs))
    (is (= (-> vt :screen :saved) screen/initial-saved-cursor))
    (is (= (-> vt :screen :insert-mode) false))
    (is (= (-> vt :screen :auto-wrap-mode) true))
    (is (= (-> vt :screen :new-line-mode) false))
    (is (= (-> vt :screen :top-margin) 0))
    (is (= (-> vt :screen :bottom-margin) 23))
    (is (= (-> vt :screen :origin-mode) false)))
  (let [vt (make-vt 20 5)]
    (is (= (-> vt :screen :tabs) #{8 16}))))

(defn feed-esc [vt str]
  (let [codes (mapv #(#?(:clj .codePointAt :cljs .charCodeAt) str %) (range (count str)))]
    (feed vt (list* 0x1b codes))))

(defn feed-csi [vt & strs]
  (feed-esc vt (apply str (list* "[" strs))))

(defn move-cursor [vt x y]
  (feed-csi vt (str (inc y) ";" (inc x) "H")))

(defn set-fg [vt fg]
  (feed-csi vt (str "3" fg "m")))

(defn set-bg [vt bg]
  (feed-csi vt (str "4" bg "m")))

(defn set-bold [vt]
  (feed-csi vt "1m"))

(defn hide-cursor [vt]
  (update vt :screen screen/hide-cursor))

(deftest print-test
  (let [vt (-> (make-vt 4 3)
               (set-fg 1))]

    (testing "printing within single line"
      (let [vt (feed-str vt "ABC")]
        (expect-lines vt [[["ABC" {:fg 1}] [" " {}]]
                          [["    " {}]]
                          [["    " {}]]])
        (expect-cursor vt 3 0 true)))

    (testing "printing non-ASCII characters"
      (let [vt (feed-str vt "ABCżÓłĆ")]
        (expect-lines vt [[["ABCż" {:fg 1}]]
                          [["ÓłĆ" {:fg 1}] [" " {}]]
                          [["    " {}]]])
        (expect-cursor vt 3 1 true)))

    (testing "printing ASCII art using special drawing character set"
      (let [vt (-> vt
                   (feed-esc "(0") ; use drawing character set
                   (feed-str "ab{|")
                   (feed-esc "(B") ; back to ASCII
                   (feed-str "ab")
                   (feed-one 0x0e) ; use drawing character set
                   (feed-str "ab{|")
                   (feed-one 0x0f) ; back to ASCII
                   (feed-str "ab"))]
        (expect-lines vt [[["▒␉π≠" {:fg 1}]]
                          [["ab▒␉" {:fg 1}]]
                          [["π≠ab" {:fg 1}]]])))

    (testing "printing in insert mode"
      (let [vt (-> vt
                   (feed-str "ABC")
                   (move-cursor 1 0)
                   (feed-csi "4h") ; enable insert mode
                   (set-fg 2)
                   (feed-str "HI"))]
        (expect-lines vt [[["A" {:fg 1}] ["HI" {:fg 2}] ["B" {:fg 1}]]
                          [["    " {}]]
                          [["    " {}]]])
        (expect-cursor vt 3 0 true)))

    (testing "printing on the right edge of the line"
      (let [vt (feed-str vt "ABCD")]
        (expect-lines vt [[["ABCD" {:fg 1}]]
                          [["    " {}]]
                          [["    " {}]]])
        (expect-cursor vt 4 0 true)
        (let [vt (feed-str vt "EF")]
          (expect-lines vt [[["ABCD" {:fg 1}]]
                            [["EF" {:fg 1}] ["  " {}]]
                            [["    " {}]]])
          (expect-cursor vt 2 1 true))
        (let [vt (feed-str vt "\nEF")]
          (expect-lines vt [[["ABCD" {:fg 1}]]
                            [["EF" {:fg 1}] ["  " {}]]
                            [["    " {}]]])
          (expect-cursor vt 2 1 true))
        (let [vt (-> vt
                     (feed-csi "1;4H") ; move to the current position (in place)
                     (feed-str "EF"))] ; next-print-wraps should have been reset above
          (expect-lines vt [[["ABCE" {:fg 1}]]
                            [["F" {:fg 1}] ["   " {}]]
                            [["    " {}]]])
          (expect-cursor vt 1 1 true))))

    (testing "printing on the right edge of the line (auto-wrap off)"
      (let [vt (-> vt
                   (feed-csi "?7l") ; reset auto-wrap
                   (feed-str "ABCDEF"))]
        (expect-lines vt [[["ABCF" {:fg 1}]]
                          [["    " {}]]
                          [["    " {}]]])
        (expect-cursor vt 3 0 true)))

    (testing "printing on the bottom right edge of the screen"
      (let [vt (feed-str vt "AAAABBBBCCCC")]
        (expect-lines vt [[["AAAA" {:fg 1}]]
                          [["BBBB" {:fg 1}]]
                          [["CCCC" {:fg 1}]]])
        (expect-cursor vt 4 2 true)
        (let [vt (feed-str vt "DD")]
          (expect-lines vt [[["BBBB" {:fg 1}]]
                            [["CCCC" {:fg 1}]]
                            [["DD  " {:fg 1}]]])
          (expect-cursor vt 2 2 true))
        (let [vt (feed-str vt "\nDD")]
          (expect-lines vt [[["BBBB" {:fg 1}]]
                            [["CCCC" {:fg 1}]]
                            [["DD  " {:fg 1}]]])
          (expect-cursor vt 2 2 true))))

    (testing "printing on the bottom right edge of the screen (auto-wrap off)"
      (let [vt (-> vt
                   (feed-str "AAAABBBBCC")
                   (feed-csi "?7l") ; reset auto-wrap
                   (feed-str "DDEFGH"))]
        (expect-lines vt [[["AAAA" {:fg 1}]]
                          [["BBBB" {:fg 1}]]
                          [["CCDH" {:fg 1}]]])
        (expect-cursor vt 3 2 true)))))

(defn test-lf [f]
  (let [vt (-> (make-vt 4 7)
               (feed-str "AAAABBBBCCCCDDDDEEEEFFFFG")
               (set-bg 3))]
    (let [vt (-> vt (move-cursor 0 0) f)]
      (expect-lines vt [[["AAAA" {}]]
                        [["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]])
      (expect-cursor vt 0 1))
    (let [vt (-> vt (move-cursor 1 1) f)]
      (expect-lines vt [[["AAAA" {}]]
                        [["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]])
      (expect-cursor vt 1 2))
    (let [vt (-> vt (move-cursor 2 6) f)]
      (expect-lines vt [[["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]
                        [["    " {:bg 3}]]])
      (expect-cursor vt 2 6))
    (let [vt (feed-csi vt "3;5r")] ; set scroll region 3-5
      (let [vt (-> vt (move-cursor 2 1) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 2))
      (let [vt (-> vt (move-cursor 2 3) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 4))
      (let [vt (-> vt (move-cursor 2 4) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["    " {:bg 3}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 4))
      (let [vt (-> vt (move-cursor 2 5) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 6))
      (let [vt (-> vt (move-cursor 2 6) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 6))
      (let [vt (feed-csi vt "20h") ; set new-line mode
            vt (-> vt (move-cursor 2 1) f)]
        (expect-cursor vt 0 2)))))

(defn test-nel [f]
  (let [vt (-> (make-vt 4 7)
               (feed-str "AAAABBBBCCCCDDDDEEEEFFFFG")
               (set-bg 3))]
    (let [vt (-> vt (move-cursor 0 0) f)]
      (expect-lines vt [[["AAAA" {}]]
                        [["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]])
      (expect-cursor vt 0 1))
    (let [vt (-> vt (move-cursor 1 1) f)]
      (expect-lines vt [[["AAAA" {}]]
                        [["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]])
      (expect-cursor vt 0 2))
    (let [vt (-> vt (move-cursor 2 6) f)]
      (expect-lines vt [[["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]
                        [["    " {:bg 3}]]])
      (expect-cursor vt 0 6))
    (let [vt (feed-csi vt "3;5r")] ; set scroll region 3-5
      (let [vt (-> vt (move-cursor 2 1) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 0 2))
      (let [vt (-> vt (move-cursor 2 3) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 0 4))
      (let [vt (-> vt (move-cursor 2 4) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["    " {:bg 3}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 0 4))
      (let [vt (-> vt (move-cursor 2 5) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 0 6))
      (let [vt (-> vt (move-cursor 2 6) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 0 6)))))

(defn test-hts [f]
  (let [vt (make-vt 20 3)]
    (expect-tabs (-> vt (move-cursor 0 0) f) #{8 16})
    (expect-tabs (-> vt (move-cursor 1 0) f) #{1 8 16})
    (expect-tabs (-> vt (move-cursor 11 0) f) #{8 11 16})
    (expect-tabs (-> vt (move-cursor 19 0) f) #{8 16 19})))

(defn test-ri [f]
  (let [vt (-> (make-vt 4 7)
               (feed-str "AAAABBBBCCCCDDDDEEEEFFFFG")
               (set-bg 3))]
    (let [vt (-> vt (move-cursor 0 6) f)]
      (expect-lines vt [[["AAAA" {}]]
                        [["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]])
      (expect-cursor vt 0 5))
    (let [vt (-> vt (move-cursor 1 5) f)]
      (expect-lines vt [[["AAAA" {}]]
                        [["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]
                        [["G   " {}]]])
      (expect-cursor vt 1 4))
    (let [vt (-> vt (move-cursor 2 0) f)]
      (expect-lines vt [[["    " {:bg 3}]]
                        [["AAAA" {}]]
                        [["BBBB" {}]]
                        [["CCCC" {}]]
                        [["DDDD" {}]]
                        [["EEEE" {}]]
                        [["FFFF" {}]]])
      (expect-cursor vt 2 0))
    (let [vt (feed-csi vt "3;5r")] ; set scroll region 3-5
      (let [vt (-> vt (move-cursor 2 5) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 4))
      (let [vt (-> vt (move-cursor 2 3) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 2))
      (let [vt (-> vt (move-cursor 2 2) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["    " {:bg 3}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 2))
      (let [vt (-> vt (move-cursor 2 1) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 0))
      (let [vt (-> vt (move-cursor 2 0) f)]
        (expect-lines vt [[["AAAA" {}]]
                          [["BBBB" {}]]
                          [["CCCC" {}]]
                          [["DDDD" {}]]
                          [["EEEE" {}]]
                          [["FFFF" {}]]
                          [["G   " {}]]])
        (expect-cursor vt 2 0)))))

(deftest control-char-test
  (let [vt (make-vt 4 3)]
    (testing "0x00 (NUL)"
      (is (= vt (feed-one vt 0x00))))

    (testing "0x01 (SOH)"
      (is (= vt (feed-one vt 0x01))))

    (testing "0x02 (STX)"
      (is (= vt (feed-one vt 0x02))))

    (testing "0x03 (ETX)"
      (is (= vt (feed-one vt 0x03))))

    (testing "0x04 (EOT)"
      (is (= vt (feed-one vt 0x04))))

    (testing "0x05 (ENQ)"
      (is (= vt (feed-one vt 0x05))))

    (testing "0x06 (ACK)"
      (is (= vt (feed-one vt 0x06))))

    (testing "0x07 (BEL)"
      (is (= vt (feed-one vt 0x07))))

    (testing "0x08 (BS)"
      (let [vt (-> vt (move-cursor 0 0) (feed-one 0x08))]
        (expect-cursor vt 0 0))
      (let [vt (-> vt (move-cursor 2 0) (feed-one 0x08))]
        (expect-cursor vt 1 0))
      (let [vt (-> vt (move-cursor 0 2) (feed-one 0x08))]
        (expect-cursor vt 0 2)))

    (testing "0x09 (HT)"
      (let [vt (make-vt 20 3)]
        (let [vt (-> vt (move-cursor 0 0) (feed-one 0x09))]
          (expect-cursor vt 8 0))
        (let [vt (-> vt (move-cursor 2 0) (feed-one 0x09))]
          (expect-cursor vt 8 0))
        (let [vt (-> vt (move-cursor 8 1) (feed-one 0x09))]
          (expect-cursor vt 16 1))
        (let [vt (-> vt (move-cursor 9 1) (feed-one 0x09))]
          (expect-cursor vt 16 1))
        (let [vt (-> vt (move-cursor 16 1) (feed-one 0x09))]
          (expect-cursor vt 19 1))
        (let [vt (-> vt (move-cursor 19 1) (feed-one 0x09))]
          (expect-cursor vt 19 1))))

    (testing "0x0b (VT), 0x0c (FF), 0x84 (IND)"
      (doseq [ch [0x0b 0x0c 0x84]]
        (test-lf #(feed-one % ch))))

    (testing "0x0d (CR)"
      (let [vt (-> vt (move-cursor 0 1) (feed-one 0x0d))]
        (expect-cursor vt 0 1))
      (let [vt (-> vt (move-cursor 2 1) (feed-one 0x0d))]
        (expect-cursor vt 0 1)))

    (testing "0x0a (LF), 0x85 (NEL)"
      (doseq [ch [0x0a 0x85]]
        (test-nel #(feed-one % ch))))

    (testing "0x88 (HTS)"
      (test-hts #(feed-one % 0x88)))

    (testing "0x8d (RI)"
      (test-ri #(feed-one % 0x8d)))))

(deftest esc-sequence-test
  (testing "ESC D (IND)"
    (test-lf #(feed-esc % "D")))

  (testing "ESC E (NEL)"
    (test-nel #(feed-esc % "E")))

  (testing "ESC H (HTS)"
    (test-hts #(feed-esc % "H")))

  (testing "ESC M (RI)"
    (test-ri #(feed-esc % "M")))

  (testing "ESC #8 (DECALN)"
    (let [vt (-> (make-vt 4 3)
                 (move-cursor 2 1)
                 (feed-esc "#8"))]
      (expect-lines vt [[["EEEE" {}]]
                        [["EEEE" {}]]
                        [["EEEE" {}]]])
      (expect-cursor vt 2 1)))

  (testing "ESC 7 (SC), CSI ?1048h"
    (let [vt (-> (make-vt 80 24)
                 (move-cursor 2 1)
                 (set-fg 1)
                 (feed-csi "?6h") ; set origin mode
                 (feed-csi "?7l") ; reset auto-wrap mode
                 (move-cursor 4 5))]
      (doseq [f [#(feed-esc % "7") #(feed-csi % "?1048h")]]
        (let [saved (-> vt f :screen screen/saved)]
          (is (= saved {:cursor {:x 4 :y 5}
                        :char-attrs {:fg 1}
                        :origin-mode true
                        :auto-wrap-mode false}))))))

  (testing "ESC 8 (RC), CSI ?1048l"
    (doseq [f [#(feed-esc % "8") #(feed-csi % "?1048l")]]
      (let [vt (-> vt-80x24
                   (move-cursor 79 10)
                   (feed-str " ") ; print on the edge
                   f)] ; restore cursor
        (is (not (-> vt :screen screen/next-print-wraps?))))
      (let [vt (-> vt-80x24
                   (set-fg 1)
                   (feed-csi "?6h") ; set origin mode
                   (feed-csi "?7l") ; reset auto-wrap mode
                   (move-cursor 4 5))]
        (let [vt (f vt)] ; restore cursor, there was no save (SC) so far
          (expect-cursor vt 0 0)
          (is (= (-> vt :screen screen/char-attrs) screen/normal-char-attrs))
          (is (not (-> vt :screen screen/origin-mode?)))
          (is (-> vt :screen screen/auto-wrap-mode?)))
        (let [vt (-> vt
                     (feed-esc "7") ; save cursor
                     (feed-csi "?6l") ; reset origin mode
                     (feed-csi "?7h") ; set auto-wrap mode
                     (feed-csi "m") ; reset char attrs
                     (feed-csi "42m") ; set bg=2
                     f)] ; restore cursor
          (expect-cursor vt 4 5)
          (is (= (-> vt :screen screen/char-attrs) {:fg 1}))
          (is (-> vt :screen screen/origin-mode?))
          (is (not (-> vt :screen screen/auto-wrap-mode?)))))))

  (testing "ESC c (RIS)"
    (let [initial-vt (make-vt 4 3)
          new-vt (-> initial-vt
                     (feed-str "AB")
                     (feed-esc "H") ; set tab
                     (feed-esc "c"))] ; reset
      (is (= initial-vt new-vt)))))

(deftest control-sequence-test
  (testing "CSI @ (ICH)"
    (let [vt (-> (make-vt 5 3)
                 (feed-str "ABCD")
                 (set-bg 3)
                 (move-cursor 1 0))]
      (let [vt (feed-csi vt "@")]
        (expect-first-line vt [["A" {}] [" " {:bg 3}] ["BCD" {}]])
        (expect-cursor vt 1 0))
      (let [vt (feed-csi vt "2@")]
        (expect-first-line vt [["A" {}] ["  " {:bg 3}] ["BC" {}]])
        (expect-cursor vt 1 0))))

  (testing "CSI A (CUU), CSI e (VPR)"
    (let [vt (make-vt 5 10)]
      (doseq [ch ["A" "e"]]
        (let [vt (-> vt
                     (move-cursor 1 0)
                     (feed-csi ch))]
          (expect-cursor vt 1 0))
        (let [vt (-> vt
                     (move-cursor 1 2)
                     (feed-csi ch))]
          (expect-cursor vt 1 1))
        (let [vt (-> vt
                     (move-cursor 1 2)
                     (feed-csi "4" ch))]
          (expect-cursor vt 1 0))
        (let [vt (feed-csi vt "4;8r")] ; set scroll region
          (let [vt (-> vt
                       (move-cursor 1 2)
                       (feed-csi ch))]
            (expect-cursor vt 1 1))
          (let [vt (-> vt
                       (move-cursor 1 6)
                       (feed-csi "5" ch))]
            (expect-cursor vt 1 3))
          (let [vt (-> vt
                       (move-cursor 1 9)
                       (feed-csi "9" ch))]
            (expect-cursor vt 1 3))))))

  (testing "CSI B (CUD)"
    (let [vt (make-vt 5 10)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed-csi "B"))]
        (expect-cursor vt 1 1))
      (let [vt (-> vt
                   (move-cursor 1 9)
                   (feed-csi "B"))]
        (expect-cursor vt 1 9))
      (let [vt (-> vt
                   (move-cursor 1 7)
                   (feed-csi "4B"))]
        (expect-cursor vt 1 9))
      (let [vt (feed-csi vt "4;8r")] ; set scroll region
        (let [vt (-> vt
                     (move-cursor 1 1)
                     (feed-csi "20B"))]
          (expect-cursor vt 1 7))
        (let [vt (-> vt
                     (move-cursor 1 6)
                     (feed-csi "5B"))]
          (expect-cursor vt 1 7))
        (let [vt (-> vt
                     (move-cursor 1 8)
                     (feed-csi "B"))]
          (expect-cursor vt 1 9)))))

  (testing "CSI C (CUF), CSI a (HPR)"
    (let [vt (make-vt 5 3)]
      (doseq [ch ["C" "a"]]
        (let [vt (-> vt
                     (move-cursor 1 0)
                     (feed-csi ch))]
          (expect-cursor vt 2 0))
        (let [vt (-> vt
                     (move-cursor 4 0)
                     (feed-csi ch))]
          (expect-cursor vt 4 0))
        (let [vt (-> vt
                     (move-cursor 2 1)
                     (feed-csi "4" ch))]
          (expect-cursor vt 4 1)))))

  (testing "CSI D (CUB)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 3 0)
                   (feed-csi "D"))]
        (expect-cursor vt 2 0))
      (let [vt (-> vt
                   (move-cursor 0 1)
                   (feed-csi "D"))]
        (expect-cursor vt 0 1))
      (let [vt (-> vt
                   (move-cursor 2 1)
                   (feed-csi "4D"))]
        (expect-cursor vt 0 1))))

  (testing "CSI E (CNL)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed-csi "E"))]
        (expect-cursor vt 0 1))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed-csi "E"))]
        (expect-cursor vt 0 2))
      (let [vt (-> vt
                   (move-cursor 1 1)
                   (feed-csi "4E"))]
        (expect-cursor vt 0 2))))

  (testing "CSI F (CPL)"
    (let [vt (make-vt 5 3)]
      (let [vt (-> vt
                   (move-cursor 1 0)
                   (feed-csi "F"))]
        (expect-cursor vt 0 0))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed-csi "F"))]
        (expect-cursor vt 0 1))
      (let [vt (-> vt
                   (move-cursor 1 2)
                   (feed-csi "4F"))]
        (expect-cursor vt 0 0))))

  (testing "CSI G (CHA), CSI ` (HPA)"
    (let [vt (-> (make-vt 5 3)
                 (move-cursor 1 1))]
      (doseq [ch ["G" "`"]]
        (let [vt (feed-csi vt ch)]
          (expect-cursor vt 0 1))
        (let [vt (feed-csi vt "3" ch)]
          (expect-cursor vt 2 1))
        (let [vt (feed-csi vt "8" ch)]
          (expect-cursor vt 4 1)))))

  (testing "CSI H (CUP), CSI f (HVP)"
    (let [vt (-> (make-vt 20 10)
                 (move-cursor 1 1))]
      (doseq [ch ["H" "f"]]
        (let [vt (feed-csi vt ch)]
          (expect-cursor vt 0 0))
        (let [vt (feed-csi vt "3" ch)]
          (expect-cursor vt 0 2))
        (let [vt (feed-csi vt ";3" ch)]
          (expect-cursor vt 2 0))
        (let [vt (feed-csi vt "3;4" ch)]
          (expect-cursor vt 3 2))
        (let [vt (feed-csi vt "15;25" ch)]
          (expect-cursor vt 19 9))
        (let [vt (feed-csi vt "4;6r")] ; set scroll region
          (let [vt (feed-csi vt "3;8" ch)]
            (expect-cursor vt 7 2))
          (let [vt (feed-csi vt "5;8" ch)]
            (expect-cursor vt 7 4))
          (let [vt (feed-csi vt "15;25" ch)]
            (expect-cursor vt 19 9))
          (let [vt (feed-csi vt "?6h")] ; set origin mode
            (let [vt (feed-csi vt "2;7" ch)]
              (expect-cursor vt 6 4))
            (let [vt (feed-csi vt "15;25" ch)]
              (expect-cursor vt 19 5)))))))

  (testing "CSI I (CHT)"
    (let [vt (-> (make-vt 80 3) (move-cursor 20 0))]
      (let [vt (feed-csi vt "I")]
        (expect-cursor vt 24 0))
      (let [vt (feed-csi vt "3I")]
        (expect-cursor vt 40 0))))

  (testing "CSI J (ED)"
    (let [vt (-> (make-vt 4 3)
                 (feed-str "ABCDEFGHIJ")
                 (set-bg 3)
                 (move-cursor 1 1))]
      (let [vt (feed-csi vt "J")]
        (expect-lines vt [[["ABCD" {}]]
                          [["E" {}] ["   " {:bg 3}]]
                          [["    " {:bg 3}]]])
        (expect-cursor vt 1 1))
      (let [vt (feed-csi vt "1J")]
        (expect-lines vt [[["    " {:bg 3}]]
                          [["  " {:bg 3}] ["GH" {}]]
                          [["IJ  " {}]]])
        (expect-cursor vt 1 1))
      (let [vt (feed-csi vt "2J")]
        (expect-lines vt [[["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]])
        (expect-cursor vt 1 1))))

  (testing "CSI K (EL)"
    (let [vt (-> (make-vt 6 2)
                 (feed-str "ABCDEF")
                 (set-bg 3)
                 (move-cursor 3 0))]
      (let [vt (feed-csi vt "K")]
        (expect-first-line vt [["ABC" {}] ["   " {:bg 3}]])
        (expect-cursor vt 3 0))
      (let [vt (feed-csi vt "1K")]
        (expect-first-line vt [["    " {:bg 3}] ["EF" {}]])
        (expect-cursor vt 3 0))
      (let [vt (feed-csi vt "2K")]
        (expect-first-line vt [["      " {:bg 3}]])
        (expect-cursor vt 3 0))))

  (testing "CSI L (IL)"
    (let [vt (-> (make-vt 4 4)
                 (feed-str "ABCDEFGHIJKLMN")
                 (set-bg 3)
                 (move-cursor 2 1))]
      (let [vt (feed-csi vt "L")]
        (expect-lines vt [[["ABCD" {}]]
                          [["    " {:bg 3}]]
                          [["EFGH" {}]]
                          [["IJKL" {}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "2L")]
        (expect-lines vt [[["ABCD" {}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["EFGH" {}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "10L")]
        (expect-lines vt [[["ABCD" {}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]])
        (expect-cursor vt 2 1))
      (let [vt (-> vt
                   (feed-csi "2;3r") ; set scroll region
                   (move-cursor 2 0))]
        (let [vt (feed-csi vt "2L")]
          (expect-lines vt [[["    " {:bg 3}]]
                            [["    " {:bg 3}]]
                            [["ABCD" {}]]
                            [["MN  " {}]]])
          (expect-cursor vt 2 0))
        (let [vt (feed-csi vt "10L")]
          (expect-lines vt [[["    " {:bg 3}]]
                            [["    " {:bg 3}]]
                            [["    " {:bg 3}]]
                            [["MN  " {}]]])
          (expect-cursor vt 2 0)))))

  (testing "CSI M (DL)"
    (let [vt (-> (make-vt 4 4)
                 (feed-str "ABCDEFGHIJKLM")
                 (move-cursor 2 1))]
      (let [vt (feed-csi vt "M")]
        (expect-lines vt [[["ABCD" {}]]
                          [["IJKL" {}]]
                          [["M   " {}]]
                          [["    " {}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "2M")]
        (expect-lines vt [[["ABCD" {}]]
                          [["M   " {}]]
                          [["    " {}]]
                          [["    " {}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "10M")]
        (expect-lines vt [[["ABCD" {}]]
                          [["    " {}]]
                          [["    " {}]]
                          [["    " {}]]])
        (expect-cursor vt 2 1))
      (let [vt (-> vt
                   (feed-csi "2;3r") ; set scroll region
                   (move-cursor 2 0))]
        (let [vt (feed-csi vt "2M")]
          (expect-lines vt [[["IJKL" {}]]
                            [["    " {}]]
                            [["    " {}]]
                            [["M   " {}]]])
          (expect-cursor vt 2 0))
        (let [vt (feed-csi vt "20M")]
          (expect-lines vt [[["    " {}]]
                            [["    " {}]]
                            [["    " {}]]
                            [["M   " {}]]])
          (expect-cursor vt 2 0)))))

  (testing "CSI P (DCH)"
    (let [vt (-> (make-vt 7 1)
                 (feed-str "ABCDEF")
                 (move-cursor 2 0))]
      (let [vt (feed-csi vt "P")]
        (expect-first-line vt [["ABDEF  " {}]])
        (expect-cursor vt 2 0))
      (let [vt (feed-csi vt "2P")]
        (expect-first-line vt [["ABEF   " {}]])
        (expect-cursor vt 2 0))
      (let [vt (feed-csi vt "10P")]
        (expect-first-line vt [["AB     " {}]])
        (expect-cursor vt 2 0))))

  (testing "CSI S (SU)"
    (let [vt (-> (make-vt 4 5)
                 (feed-str "ABCDEFGHIJKLMNOPQR")
                 (set-bg 3)
                 (move-cursor 2 1))]
      (let [vt (feed-csi vt "S")]
        (expect-lines vt [[["EFGH" {}]]
                          [["IJKL" {}]]
                          [["MNOP" {}]]
                          [["QR  " {}]]
                          [["    " {:bg 3}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "2S")]
        (expect-lines vt [[["IJKL" {}]]
                          [["MNOP" {}]]
                          [["QR  " {}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "10S")]
        (expect-lines vt [[["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]])
        (expect-cursor vt 2 1))
      (let [vt (-> vt
                   (feed-csi "2;4r")
                   (move-cursor 2 0))
            vt (feed-csi vt "2S")]
        (expect-lines vt [[["ABCD" {}]]
                          [["MNOP" {}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["QR  " {}]]])
        (expect-cursor vt 2 0))))

  (testing "CSI T (SD)"
    (let [vt (-> (make-vt 4 5)
                 (feed-str "ABCDEFGHIJKLMNOPQR")
                 (set-bg 3)
                 (move-cursor 2 1))]
      (let [vt (feed-csi vt "T")]
        (expect-lines vt [[["    " {:bg 3}]]
                          [["ABCD" {}]]
                          [["EFGH" {}]]
                          [["IJKL" {}]]
                          [["MNOP" {}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "2T")]
        (expect-lines vt [[["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["ABCD" {}]]
                          [["EFGH" {}]]
                          [["IJKL" {}]]])
        (expect-cursor vt 2 1))
      (let [vt (feed-csi vt "10T")]
        (expect-lines vt [[["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]])
        (expect-cursor vt 2 1))
      (let [vt (-> vt
                   (feed-csi "2;4r")
                   (move-cursor 2 0))
            vt (feed-csi vt "2T")]
        (expect-lines vt [[["ABCD" {}]]
                          [["    " {:bg 3}]]
                          [["    " {:bg 3}]]
                          [["EFGH" {}]]
                          [["QR  " {}]]])
        (expect-cursor vt 2 0))))

  (testing "CSI W (CTC)"
    (let [vt (-> (make-vt 30 24))]
      (let [vt (-> vt (move-cursor 5 0) (feed-csi "W"))]
        (expect-tabs vt #{5 8 16 24}))
      (let [vt (-> vt (move-cursor 5 0) (feed-csi "0W"))]
        (expect-tabs vt #{5 8 16 24}))
      (let [vt (-> vt (move-cursor 16 0) (feed-csi "2W"))]
        (expect-tabs vt #{8 24}))
      (let [vt (-> vt (feed-csi "5W"))]
        (expect-tabs vt #{}))))

  (testing "CSI X (ECH)"
    (let [vt (-> (make-vt 7 1)
                 (feed-str "ABCDEF")
                 (set-bg 3)
                 (move-cursor 2 0))]
      (let [vt (feed-csi vt "X")]
        (expect-first-line vt [["AB" {}] [" " {:bg 3}] ["DEF " {}]])
        (expect-cursor vt 2 0))
      (let [vt (feed-csi vt "2X")]
        (expect-first-line vt [["AB" {}] ["  " {:bg 3}] ["EF " {}]])
        (expect-cursor vt 2 0))
      (let [vt (feed-csi vt "100X")]
        (expect-first-line vt [["AB" {}] ["     " {:bg 3}] ])
        (expect-cursor vt 2 0))))

  (testing "CSI Z"
    (let [vt (make-vt 20 3)]
      (let [vt (-> vt (move-cursor 0 0) (feed-csi "Z"))]
        (expect-cursor vt 0 0))
      (let [vt (-> vt (move-cursor 2 0) (feed-csi "2Z"))]
        (expect-cursor vt 0 0))
      (let [vt (-> vt (move-cursor 8 1) (feed-csi "Z"))]
        (expect-cursor vt 0 1))
      (let [vt (-> vt (move-cursor 9 1) (feed-csi "Z"))]
        (expect-cursor vt 8 1))
      (let [vt (-> vt (move-cursor 18 1) (feed-csi "2Z"))]
        (expect-cursor vt 8 1))))

  (testing "CSI d (VPA)"
    (let [vt (-> (make-vt 80 24)
                 (move-cursor 15 1))]
      (let [vt (feed-csi vt "d")]
        (expect-cursor vt 15 0))
      (let [vt (feed-csi vt "5d")]
        (expect-cursor vt 15 4))
      (let [vt (feed-csi vt "10;15r")] ; set scroll region
        (let [vt (feed-csi vt "5d")]
          (expect-cursor vt 0 4))
        (let [vt (feed-csi vt "?6h")] ; set origin mode
          (let [vt (feed-csi vt "3d")]
            (expect-cursor vt 0 11))
          (let [vt (feed-csi vt "8d")]
            (expect-cursor vt 0 14))))))

  (testing "CSI g (TBC)"
    (let [vt (-> (make-vt 45 24)
                 (move-cursor 24 0))]
      (let [vt (feed-csi vt "g")]
        (expect-tabs vt #{8 16 32 40}))
      (let [vt (feed-csi vt "3g")]
        (expect-tabs vt #{}))))

  (testing "CSI 4h (SM)"
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "4h"))]
      (is (-> vt :screen screen/insert-mode?))))

  (testing "CSI 20h (SM)"
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "20h"))]
      (is (-> vt :screen screen/new-line-mode?))))

  (testing "CSI ?6h (DECSM)" ; set origin mode
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "3;5r") ; set scroll region
                 (move-cursor 1 1)
                 (feed-csi "?6h"))]
      (is (-> vt :screen screen/origin-mode?))
      (expect-cursor vt 0 2)))

  (testing "CSI ?7h (DECSM)" ; set auto-wrap mode
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "?7h"))]
      (is (-> vt :screen screen/auto-wrap-mode?))))

  (testing "CSI ?25h (DECSM)" ; show cursor
    (let [vt (-> (make-vt 80 24)
                 hide-cursor
                 (feed-csi "?25h"))] ; show cursor
      (expect-cursor vt 0 0 true)))

  (testing "CSI ?47h, CSI ?1047h (DECSM)" ; switch to alternate buffer
    (let [vt (make-vt 4 3)]
      (doseq [cseq ["?47h" "?1047h"]]
        (testing "when in primary buffer"
          (let [vt (-> vt
                       (feed-str "ABC\n\rDE")
                       (set-bg 2)
                       (feed-csi cseq))]
            (expect-cursor vt 2 1)
            (expect-lines vt [[["    " {:bg 2}]]
                              [["    " {:bg 2}]]
                              [["    " {:bg 2}]]])))
        (testing "when in alternate buffer"
          (let [vt (-> vt
                       (feed-csi cseq)
                       (feed-str "ABC\n\rDE")
                       (feed-csi cseq))]
            (expect-cursor vt 2 1)
            (expect-lines vt [[["ABC " {}]]
                              [["DE  " {}]]
                              [["    " {}]]]))))))

  (testing "CSI ?1049h (DECSM)" ; save cursor and switch to alternate buffer
    (let [vt (make-vt 4 3)]
      (testing "when in primary buffer"
        (let [vt (-> vt
                     (feed-str "ABC\n\rDE")
                     (set-bg 2)
                     (feed-csi "?1049h"))]
          (expect-cursor vt 2 1)
          (expect-lines vt [[["    " {:bg 2}]]
                            [["    " {:bg 2}]]
                            [["    " {:bg 2}]]])))
      (testing "when in alternate buffer"
        (let [vt (-> vt
                     (feed-csi "?1049h")
                     (feed-str "ABC\n\rDE")
                     (feed-csi "?1049h"))]
          (expect-cursor vt 2 1)
          (expect-lines vt [[["ABC " {}]]
                            [["DE  " {}]]
                            [["    " {}]]])))))

  (testing "CSI ?h (DECSM)" ; set multiple modes
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "?6;7;25h"))]
      (is (-> vt :screen screen/origin-mode?))
      (is (-> vt :screen screen/auto-wrap-mode?))
      (is (-> vt :screen screen/cursor :visible))))

  (testing "CSI 4l (RM)"
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "4l"))]
      (is (not (-> vt :screen screen/insert-mode?)))))

  (testing "CSI 20l (RM)"
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "20l"))]
      (is (not (-> vt :screen screen/new-line-mode?)))))

  (testing "CSI ?6l (DECRM)" ; reset origin mode
    (let [vt (-> (make-vt 20 10)
                 (feed-csi "3;5r") ; set scroll region
                 (feed-csi "?6h") ; set origin mode
                 (move-cursor 1 1)
                 (feed-csi "?6l"))]
      (is (not (-> vt :screen screen/origin-mode?)))
      (expect-cursor vt 0 0)))

  (testing "CSI ?7l (DECRM)"
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "?7l"))]
      (is (not (-> vt :screen screen/auto-wrap-mode?)))))

  (testing "CSI ?25l (DECRM)" ; hide cursor
    (let [vt (-> (make-vt 80 24)
                 (feed-csi "?25l"))]
      (expect-cursor vt 0 0 false)))

  (testing "CSI ?47l, ?1047l (DECRM)" ; switch back to primary buffer
    (let [vt (make-vt 4 3)]
      (doseq [cseq ["?1047l"]]
        (testing "when in primary buffer"
          (let [vt (-> vt
                       (feed-str "ABC\n\rDE")
                       (feed-csi cseq))]
            (expect-cursor vt 2 1)
            (expect-lines vt [[["ABC " {}]]
                              [["DE  " {}]]
                              [["    " {}]]])))
        (testing "when in alternate buffer"
          (let [vt (-> vt
                       (feed-str "ABC\n\rDE")
                       (set-bg 2)
                       (feed-csi "?1047h") ; set alternate buffer
                       (feed-str "\n\rX")
                       (feed-csi cseq))]
            (expect-cursor vt 1 2)
            (expect-lines vt [[["ABC " {}]]
                              [["DE  " {}]]
                              [["    " {}]]]))))))

  (testing "CSI ?1049l (DECRM)" ; switch back to primary buffer and restore cursor
    (let [vt (make-vt 4 3)]
      (testing "when in primary buffer"
        (let [vt (-> vt
                     (feed-str "ABC\n\rDE")
                     (feed-csi "?1049l"))]
          (expect-cursor vt 0 0)
          (expect-lines vt [[["ABC " {}]]
                            [["DE  " {}]]
                            [["    " {}]]])))
      (testing "when in alternate buffer"
        (let [vt (-> vt
                     (feed-str "ABC\n\rDE")
                     (set-bg 2)
                     (feed-csi "?1049h")
                     (feed-str "\n\rXYZ")
                     (feed-esc "7")
                     (feed-csi "?1049l"))]
          (expect-cursor vt 2 1)
          (expect-lines vt [[["ABC " {}]]
                            [["DE  " {}]]
                            [["    " {}]]])))))

  (testing "CSI ?l (DECRM)" ; reset multiple modes
    (let [vt (make-vt 80 24)]
      (testing "resetting multiple modes"
        (let [vt (feed-csi vt "?6;7;25l")]
          (is (not (-> vt :screen screen/origin-mode?)))
          (is (not (-> vt :screen screen/auto-wrap-mode?)))
          (is (not (-> vt :screen screen/cursor :visible)))))))

  (testing "CSI m (SGR)"
    (let [vt (make-vt 21 1)
          all-on-params "1;3;4;5;7;31;42m"
          all-on-attrs {:bold true :italic true :underline true :blink true
                        :inverse true :fg 1 :bg 2}
          compare-attrs #(= (-> %1 (feed-csi %2) (feed-str "A") :screen screen/lines ffirst last) %3)]
      (are [input-str expected-attrs] (compare-attrs vt input-str expected-attrs)
        "1m" {:bold true}
        "3m" {:italic true}
        "4m" {:underline true}
        "5m" {:blink true}
        "7m" {:inverse true}
        "32m" {:fg 2}
        "43m" {:bg 3}
        "93m" {:fg 11}
        "104m" {:bg 12}
        "1;38;5;88;48;5;99;5m" {:fg 88 :bg 99 :bold true :blink true}
        "1;38;2;1;101;201;48;2;2;102;202;5m" {:fg [1 101 201] :bg [2 102 202] :bold true :blink true}
        all-on-params all-on-attrs)
      (let [vt (feed-csi vt all-on-params)]
        (are [input-str expected-attrs] (compare-attrs vt input-str expected-attrs)
          "m" screen/normal-char-attrs ; implicit 0 param
          "0m" screen/normal-char-attrs ; explicit 0 param
          "21m" (dissoc all-on-attrs :bold)
          "22m" (dissoc all-on-attrs :bold)
          "23m" (dissoc all-on-attrs :italic)
          "24m" (dissoc all-on-attrs :underline)
          "25m" (dissoc all-on-attrs :blink)
          "27m" (dissoc all-on-attrs :inverse)
          "39m" (dissoc all-on-attrs :fg)
          "49m" (dissoc all-on-attrs :bg)))))

  (testing "CSI !p (DECSTR)"
    (let [vt (-> (make-vt 4 4)
                 (feed-str "ABCDEFGHI")
                 (feed-csi "2;3r") ; set scroll region
                 (feed-csi "?6h") ; set origin mode
                 (feed-csi "4h") ; set insert mode
                 (feed-csi "?25l") ; hide cursor
                 (move-cursor 2 1) ; this will be relative to top margin
                 (set-fg 1)
                 (feed-esc "7") ; save cursor
                 (feed-csi "!p"))] ; soft reset
      (expect-lines vt [[["ABCD" {}]]
                        [["EFGH" {}]]
                        [["I   " {}]]
                        [["    " {}]]])
      (expect-cursor vt 2 2 true)
      (is (= (-> vt :screen screen/char-attrs) screen/normal-char-attrs))
      (is (not (-> vt :screen screen/insert-mode?)))
      (is (not (-> vt :screen screen/origin-mode?)))
      (is (= (-> vt :screen screen/top-margin) 0))
      (is (= (-> vt :screen screen/bottom-margin) 3))
      (is (= (-> vt :screen screen/saved) screen/initial-saved-cursor))))

  (testing "CSI r (DECSTBM)"
    (let [vt (make-vt 80 24)]
      (let [vt (feed-csi vt "r")]
        (is (= (-> vt :screen screen/top-margin) 0))
        (is (= (-> vt :screen screen/bottom-margin) 23))
        (expect-cursor vt 0 0))
      (let [vt (-> vt
                   (move-cursor 20 10)
                   (feed-csi "5;15r"))]
        (is (= (-> vt :screen screen/top-margin) 0))
        (is (= (-> vt :screen screen/bottom-margin) 23))
        (expect-cursor vt 0 0))
      (let [vt (-> vt
                   (feed-csi "?6h") ; set origin mode
                   (move-cursor 20 10)
                   (feed-csi "5;15r"))] ; set scroll region
        (is (= (-> vt :screen screen/top-margin) 4))
        (is (= (-> vt :screen screen/bottom-margin) 14))
        (expect-cursor vt 0 4)))))

(deftest get-params-test
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser-params] []))]
    (is (= (get-params vt) [])))
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser-params] [0x33]))]
    (is (= (get-params vt) [3])))
  (let [vt (-> (make-vt 4 3) (assoc-in [:parser-params] [0x3b 0x3b 0x31 0x32 0x3b 0x3b 0x32 0x33 0x3b 0x31 0x3b]))]
    (is (= (get-params vt) [0 0 12 0 23 1]))))

(def gen-unicode-rubbish (gen/vector (gen/choose 0 0x10ffff) 1 20))

(def gen-color (gen/one-of [(gen/return nil)
                            (gen/choose 0 15)
                            (gen/choose 16 231)
                            (gen/tuple (gen/choose 0 255) (gen/choose 0 255) (gen/choose 0 255))]))

(def gen-ctl-seq (gen/let [char (gen/elements (reduce into #{} [(range 0x00 0x18)
                                                                [0x19]
                                                                (range 0x1c 0x20)]))]
                   [char]))

(def gen-intermediate (gen/elements (range 0x20 0x30)))

(def gen-finalizer (gen/elements (reduce into #{} [(range 0x30 0x50)
                                                   (range 0x51 0x58)
                                                   [0x59]
                                                   [0x5a]
                                                   [0x5c]
                                                   (range 0x60 0x7f)])))

(def gen-esc-seq (gen/let [intermediates (gen/vector gen-intermediate 0 2)
                           finalizer gen-finalizer]
                   (apply concat [[0x1b] intermediates [finalizer]])))

(def gen-param (gen/elements (range 0x30 0x3a)))

(def gen-params (gen/vector (gen/one-of [gen-param
                                         gen-param
                                         (gen/return 0x3b)]) 0 5))

(def gen-csi-seq (gen/let [params gen-params
                           finalizer (gen/elements (range 0x40 0x7f))]
                   (apply concat [[0x1b 0x5b] params [finalizer]])))

(def gen-sgr-seq (gen/let [params gen-params]
                   (apply concat [[0x1b 0x5b] params [0x6d]])))

(def gen-ascii-char (gen/choose 0x20 0x7f))

(def gen-char (gen/one-of [gen-ascii-char
                           gen-ascii-char
                           gen-ascii-char
                           gen-ascii-char
                           gen-ascii-char
                           (gen/choose 0x80 0xd7ff)
                           ; skip Unicode surrogates and private use area
                           (gen/choose 0xf900 0xffff)]))

(def gen-text (gen/vector gen-char 1 10))

(def gen-input (gen/one-of [gen-ctl-seq
                            gen-esc-seq
                            gen-csi-seq
                            gen-sgr-seq
                            gen-text]))

(defspec test-parser-state-for-random-input
  {:num-tests (* 10 (property-tests-multiplier))}
  (prop/for-all [rubbish gen-unicode-rubbish]
                (let [vt (-> (make-vt 80 24) (feed rubbish))]
                  (keyword? (-> vt :parser-state)))))

(defspec test-cursor-position-for-random-input
  {:num-tests (* 100 (property-tests-multiplier))}
  (prop/for-all [x (gen/choose 0 19)
                 y (gen/choose 0 9)
                 input gen-input]
                (let [vt (-> (make-vt 20 10)
                             (move-cursor x y)
                             (feed input))
                      {:keys [x y]} (-> vt :screen screen/cursor)]
                  (and (or (< -1 x 20) (and (= x 20) (-> vt :screen screen/next-print-wraps?)))
                       (< -1 y 10)))))

(defspec test-row-and-column-count-for-random-input
  {:num-tests (* 100 (property-tests-multiplier))}
  (prop/for-all [x (gen/choose 0 19)
                 y (gen/choose 0 9)
                 input gen-input]
                (let [vt (-> (make-vt 20 10)
                             (move-cursor x y)
                             (feed input))
                      lines (-> vt :screen :lines)]
                  (and (= 10 (count lines))
                       (every? #(= 20 (count %)) lines)))))

(defspec test-no-wrapping-after-moved-from-right-margin
  {:num-tests (* 100 (property-tests-multiplier))}
  (prop/for-all [y (gen/choose 0 9)
                 input gen-input]
                (let [vt (-> (make-vt 20 10)
                             (move-cursor 19 y)
                             (feed input))
                      new-x (-> vt :screen screen/cursor :x)
                      next-print-wraps (-> vt :screen screen/next-print-wraps?)]
                  (not (and next-print-wraps (< new-x 20))))))

(defspec test-dump-sgr
  {:num-tests (* 100 (property-tests-multiplier))}
  (prop/for-all [fg gen-color
                 bg gen-color
                 bold gen/boolean
                 italic gen/boolean
                 underline gen/boolean
                 blink gen/boolean
                 inverse gen/boolean]
                (let [attrs (cond-> {}
                              fg (assoc :fg fg)
                              bg (assoc :bg bg)
                              bold (assoc :bold bold)
                              italic (assoc :italic italic)
                              underline (assoc :underline underline)
                              blink (assoc :blink blink)
                              inverse (assoc :inverse inverse))
                      sgr (dump-sgr attrs)
                      new-vt (feed-str vt-80x24 sgr)
                      new-attrs (-> new-vt :screen screen/char-attrs)]
                  (= attrs new-attrs))))

(defspec test-dump
  {:num-tests (* 100 (property-tests-multiplier))}
  (prop/for-all [input (gen/vector gen-input 5 100)]
                (let [blank-vt (make-vt 10 5)
                      vt (reduce feed blank-vt input)
                      text (dump vt)
                      new-vt (feed-str blank-vt text)]
                  (= (-> vt :screen screen/lines) (-> new-vt :screen screen/lines)))))
