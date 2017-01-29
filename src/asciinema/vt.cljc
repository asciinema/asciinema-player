(ns asciinema.vt
  (:refer-clojure :exclude [print])
  (:require [asciinema.vt.screen :as screen]
            [asciinema.vt.parser :as parser]
            [asciinema.player.util :refer [adjust-to-range]]
            [schema.core :as s #?@(:cljs [:include-macros true])]
            [clojure.string :as str]
            #?(:cljs [asciinema.player.codepoint-polyfill])
            #?(:clj [clojure.core.match :refer [match]]
               :cljs [cljs.core.match :refer-macros [match]])
            #?(:cljs [asciinema.vt.screen :refer [Screen]]))
  #?(:clj (:import [asciinema.vt.screen Screen])))

;; References:
;; http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
;; http://www.inwap.com/pdp10/ansicode.txt
;; http://manpages.ubuntu.com/manpages/lucid/man7/urxvt.7.html
;; http://en.wikipedia.org/wiki/ANSI_escape_code
;; http://vt100.net/emu/dec_ansi_parser
;; http://ttssh2.sourceforge.jp/manual/en/about/ctrlseq.html
;; http://real-world-systems.com/docs/ANSIcode.html
;; http://www.shaels.net/index.php/propterm/documents
;; http://vt100.net/docs/vt102-ug/chapter5.html

(def Parser {:state s/Keyword
             :intermediate-chars [s/Num]
             :param-chars [s/Num]})

(s/defrecord VT
    [parser :- Parser
     screen :- Screen])

(def initial-parser {:state :ground
                     :intermediate-chars []
                     :param-chars []})

(s/defn make-vt :- VT
  [width :- s/Num
   height :- s/Num]
  (map->VT {:parser initial-parser
            :screen (screen/blank-screen width height)}))

;; helper functions

(defn set-mode [vt intermediate param]
  (match [intermediate param]
         [nil 4] (update vt :screen screen/enable-insert-mode)
         [nil 20] (update vt :screen screen/enable-new-line-mode)
         [0x3f 6] (update vt :screen #(-> % screen/enable-origin-mode screen/move-cursor-to-home))
         [0x3f 7] (update vt :screen screen/enable-auto-wrap-mode)
         [0x3f 25] (update vt :screen screen/show-cursor)
         [0x3f 47] (update vt :screen screen/switch-to-alternate-buffer)
         [0x3f 1047] (update vt :screen screen/switch-to-alternate-buffer)
         [0x3f 1048] (update vt :screen screen/save-cursor)
         [0x3f 1049] (update vt :screen #(-> % screen/save-cursor screen/switch-to-alternate-buffer))
         :else vt))

(defn reset-mode [vt intermediate param]
  (match [intermediate param]
         [nil 4] (update vt :screen screen/disable-insert-mode)
         [nil 20] (update vt :screen screen/disable-new-line-mode)
         [0x3f 6] (update vt :screen #(-> % screen/disable-origin-mode screen/move-cursor-to-home))
         [0x3f 7] (update vt :screen screen/disable-auto-wrap-mode)
         [0x3f 25] (update vt :screen screen/hide-cursor)
         [0x3f 47] (update vt :screen screen/switch-to-primary-buffer)
         [0x3f 1047] (update vt :screen screen/switch-to-primary-buffer)
         [0x3f 1048] (update vt :screen screen/restore-cursor)
         [0x3f 1049] (update vt :screen #(-> % screen/switch-to-primary-buffer screen/restore-cursor))
         :else vt))

(defn split-coll [elem coll]
  (loop [coll coll
         parts []
         part []]
    (if-let [e (first coll)]
      (if (= e elem)
        (recur (rest coll) (conj parts part) [])
        (recur (rest coll) parts (conj part e)))
      (if (seq part)
        (conj parts part)
        parts))))

(defn reduce-param [chars]
  (let [digits (map #(- % 0x30) chars)
        components (map * (reverse digits) (iterate #(* 10 %) 1))]
    (reduce + 0 components)))

(defn get-intermediate [vt n]
  (get-in vt [:parser :intermediate-chars n]))

(def get-cached-params (memoize (fn [chars]
                                  (let [groups (split-coll 0x3b chars)]
                                    (map reduce-param groups)))))

(defn get-params [vt]
  (get-cached-params (-> vt :parser :param-chars)))

(defn get-param [vt n default]
  (let [v (nth (get-params vt) n 0)]
    (if (zero? v)
      default
      v)))

;; terminal control functions

(defn execute-bs [vt]
  (update vt :screen screen/move-cursor-left))

(defn execute-ht [vt]
  (update vt :screen screen/move-cursor-to-next-tab 1))

(defn execute-cr [vt]
  (update vt :screen screen/move-cursor-to-col! 0))

(defn execute-lf [vt]
  (update vt :screen screen/line-feed))

(defn execute-so [vt]
  (update vt :screen screen/set-special-charset))

(defn execute-si [vt]
  (update vt :screen screen/set-default-charset))

(defn execute-nel [vt]
  (update vt :screen screen/new-line))

(defn execute-hts [vt]
  (update vt :screen screen/set-horizontal-tab))

(defn execute-ri [vt]
  (update vt :screen screen/reverse-index))

(defn execute-decaln [vt]
  (update vt :screen screen/test-pattern))

(defn execute-sc [vt]
  (update vt :screen screen/save-cursor))

(defn execute-rc [vt]
  (update vt :screen screen/restore-cursor))

(defn execute-ris [vt]
  (make-vt (-> vt :screen screen/width) (-> vt :screen screen/height)))

(defn execute-ich [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/insert-characters n)))

(defn execute-cuu [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/cursor-up n)))

(defn execute-cud [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/cursor-down n)))

(defn execute-cuf [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/cursor-forward n)))

(defn execute-cub [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/cursor-backward n)))

(defn execute-cnl [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen #(-> %
                            (screen/cursor-down n)
                            (screen/move-cursor-to-col! 0)))))

(defn execute-cpl [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen #(-> %
                            (screen/cursor-up n)
                            (screen/move-cursor-to-col! 0)))))

(defn execute-cha [vt]
  (let [x (dec (get-param vt 0 1))]
    (update vt :screen screen/move-cursor-to-col x)))

(defn execute-cup [vt]
  (let [y (dec (get-param vt 0 1))
        x (dec (get-param vt 1 1))]
    (update vt :screen screen/move-cursor x y)))

(defn execute-cht [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/move-cursor-to-next-tab n)))

(defn execute-ed [vt]
  (let [n (get-param vt 0 0)]
    (update vt :screen (case n
                         0 screen/clear-to-end-of-screen
                         1 screen/clear-to-beginning-of-screen
                         2 screen/clear-screen
                         identity))))

(defn execute-el [vt]
  (let [n (get-param vt 0 0)]
    (update vt :screen (case n
                         0 screen/clear-to-end-of-line
                         1 screen/clear-to-beginning-of-line
                         2 screen/clear-line
                         identity))))

(defn execute-su [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/scroll-up n)))

(defn execute-sd [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/scroll-down n)))

(defn execute-il [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/insert-lines n)))

(defn execute-dl [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/delete-lines n)))

(defn execute-dch [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/delete-characters n)))

(defn execute-ctc [vt]
  (let [n (get-param vt 0 0)]
    (case n
      0 (update vt :screen screen/set-horizontal-tab)
      2 (update vt :screen screen/clear-horizontal-tab)
      5 (update vt :screen screen/clear-all-horizontal-tabs)
      vt)))

(defn execute-ech [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/erase-characters n)))

(defn execute-cbt [vt]
  (let [n (get-param vt 0 1)]
    (update vt :screen screen/move-cursor-to-prev-tab n)))

(defn execute-tbc [vt]
  (let [n (get-param vt 0 0)]
    (case n
      0 (update vt :screen screen/clear-horizontal-tab)
      3 (update vt :screen screen/clear-all-horizontal-tabs)
      vt)))

(defn execute-sm [vt]
  (let [intermediate (get-intermediate vt 0)]
    (reduce #(set-mode %1 intermediate %2) vt (get-params vt))))

(defn execute-rm [vt]
  (let [intermediate (get-intermediate vt 0)]
    (reduce #(reset-mode %1 intermediate %2) vt (get-params vt))))

(defn execute-sgr* [screen params]
  (loop [screen screen
         params params]
    (if (seq params)
      (let [x (first params)]
        (case x
          0  (recur (screen/reset-char-attrs screen) (rest params))
          1  (recur (screen/set-attr screen :bold true) (rest params))
          3  (recur (screen/set-attr screen :italic true) (rest params))
          4  (recur (screen/set-attr screen :underline true) (rest params))
          5  (recur (screen/set-attr screen :blink true) (rest params))
          7  (recur (screen/set-attr screen :inverse true) (rest params))
          21 (recur (screen/unset-attr screen :bold) (rest params))
          22 (recur (screen/unset-attr screen :bold) (rest params))
          23 (recur (screen/unset-attr screen :italic) (rest params))
          24 (recur (screen/unset-attr screen :underline) (rest params))
          25 (recur (screen/unset-attr screen :blink) (rest params))
          27 (recur (screen/unset-attr screen :inverse) (rest params))
          (30 31 32 33 34 35 36 37) (recur (screen/set-attr screen :fg (- x 30)) (rest params))
          38 (case (second params)
               2 (let [[r g b] (take 3 (drop 2 params))]
                   (if b ; all r, g and b are not nil
                     (recur (screen/set-attr screen :fg [r g b]) (drop 5 params))
                     (recur screen (drop 2 params))))
               5 (if-let [fg (first (drop 2 params))]
                   (recur (screen/set-attr screen :fg fg) (drop 3 params))
                   (recur screen (drop 2 params)))
               (recur screen (rest params)))
          39 (recur (screen/unset-attr screen :fg) (rest params))
          (40 41 42 43 44 45 46 47) (recur (screen/set-attr screen :bg (- x 40)) (rest params))
          48 (case (second params)
               2 (let [[r g b] (take 3 (drop 2 params))]
                   (if b ; all r, g and b are not nil
                     (recur (screen/set-attr screen :bg [r g b]) (drop 5 params))
                     (recur screen (drop 2 params))))
               5 (if-let [bg (first (drop 2 params))]
                   (recur (screen/set-attr screen :bg bg) (drop 3 params))
                   (recur screen (drop 2 params)))
               (recur screen (rest params)))
          49 (recur (screen/unset-attr screen :bg) (rest params))
          (90 91 92 93 94 95 96 97) (recur (screen/set-attr screen :fg (- x 82)) (rest params))
          (100 101 102 103 104 105 106 107) (recur (screen/set-attr screen :bg (- x 92)) (rest params))
          (recur screen (rest params))))
      screen)))

(defn execute-sgr [vt]
  (let [params (or (seq (get-params vt)) [0])]
    (update vt :screen execute-sgr* params)))

(defn execute-vpa [vt]
  (let [n (dec (get-param vt 0 1))]
    (update vt :screen screen/move-cursor-to-row-within-margins n)))

(defn execute-decstr [vt]
  (if (= (get-intermediate vt 0) 0x21)
    (update vt :screen screen/soft-reset)
    vt))

(defn execute-decstbm [vt]
  (let [top (dec (get-param vt 0 1))
        bottom (some-> vt (get-param 1 nil) dec)]
    (update vt :screen #(-> %
                            (screen/set-margins top bottom)
                            screen/move-cursor-to-home))))

;; parser actions

(defn ignore [vt input]
  vt)

(defn print [vt input]
  (update vt :screen screen/print input))

(defn execute [vt input]
  (if-let [action (case input
                    0x08 execute-bs
                    0x09 execute-ht
                    0x0a execute-nel
                    0x0b execute-lf
                    0x0c execute-lf
                    0x0d execute-cr
                    0x0e execute-so
                    0x0f execute-si
                    0x84 execute-lf
                    0x85 execute-nel
                    0x88 execute-hts
                    0x8d execute-ri
                    nil)]
    (action vt)
    vt))

(defn clear [vt input]
  (update vt :parser assoc :intermediate-chars [] :param-chars []))

(defn collect [vt input]
  (update-in vt [:parser :intermediate-chars] conj input))

(defn param [vt input]
  (update-in vt [:parser :param-chars] conj input))

(defn esc-dispatch [vt input]
  (match [(get-intermediate vt 0) input]
         [nil (_ :guard #(<= 0x40 % 0x5f))] (execute vt (+ input 0x40))
         [nil 0x37] (execute-sc vt)
         [nil 0x38] (execute-rc vt)
         [nil 0x63] (execute-ris vt)
         [0x23 0x38] (execute-decaln vt)
         [0x28 0x30] (execute-so vt)
         [0x28 _] (execute-si vt)
         :else vt))

(defn csi-dispatch [vt input]
  (if-let [action (case input
                    0x40 execute-ich
                    0x41 execute-cuu
                    0x42 execute-cud
                    0x43 execute-cuf
                    0x44 execute-cub
                    0x45 execute-cnl
                    0x46 execute-cpl
                    0x47 execute-cha
                    0x48 execute-cup
                    0x49 execute-cht
                    0x4a execute-ed
                    0x4b execute-el
                    0x4c execute-il
                    0x4d execute-dl
                    0x50 execute-dch
                    0x53 execute-su
                    0x54 execute-sd
                    0x57 execute-ctc
                    0x58 execute-ech
                    0x5a execute-cbt
                    0x60 execute-cha
                    0x61 execute-cuf
                    0x64 execute-vpa
                    0x65 execute-cuu
                    0x66 execute-cup
                    0x67 execute-tbc
                    0x68 execute-sm
                    0x6c execute-rm
                    0x6d execute-sgr
                    0x70 execute-decstr
                    0x72 execute-decstbm
                    nil)]
    (action vt)
    vt))

(defn hook [vt input]
  vt)

(defn put [vt input]
  vt)

(defn unhook [vt input]
  vt)

(defn osc-start [vt input]
  vt)

(defn osc-put [vt input]
  vt)

(defn osc-end [vt input]
  vt)

;; end actions

(def action-mapping
  {:execute execute
   :print print
   :clear clear
   :collect collect
   :esc-dispatch esc-dispatch
   :ignore ignore
   :csi-dispatch csi-dispatch
   :param param
   :hook hook
   :put put
   :unhook unhook
   :osc-start osc-start
   :osc-put osc-put
   :osc-end osc-end})

(defn execute-actions [vt actions input]
  (loop [vt vt
         actions actions]
    (if (seq actions)
      (recur ((action-mapping (first actions)) vt input) (next actions))
      vt)))

(defn feed [vt inputs]
  (loop [vt vt
         parser-state (-> vt :parser :state)
         inputs inputs]
    (if-let [input (first inputs)]
      (let [[new-parser-state actions] (parser/parse parser-state input)]
          (recur (execute-actions vt actions input) new-parser-state (rest inputs)))
      (assoc-in vt [:parser :state] parser-state))))

(defn feed-one [vt input]
  (feed vt [input]))

(defn feed-str [vt str]
  (let [codes (mapv #(#?(:clj .codePointAt :cljs .codePointAt) str %) (range (count str)))]
    (feed vt codes)))

(defn dump-color [base c]
  (match c
         [r g b] (str (+ base 8) ";2;" r ";" g ";" b)
         (_ :guard #(< % 8)) (str (+ base c))
         (_ :guard #(< % 16)) (str (+ base 52 c))
         :else (str (+ base 8) ";5;" c)))

(def dump-fg (partial dump-color 30))
(def dump-bg (partial dump-color 40))

(defn dump-sgr [{:keys [fg bg bold italic underline blink inverse]}]
  (str
   (cond-> "\u001b[0"
     fg (str ";" (dump-fg fg))
     bg (str ";" (dump-bg bg))
     bold (str ";1")
     italic (str ";3")
     underline (str ";4")
     blink (str ";5")
     inverse (str ";7"))
   "m"))

(defn dump-fragment [[text attrs]]
  (str (dump-sgr attrs) text))

(defn dump-line [line]
  (str/replace (str/join (map dump-fragment line)) #"\u001b\[0m\u0020+$" ""))

(defn dump [vt]
  (str/join "\n" (map dump-line (-> vt :screen screen/lines))))
