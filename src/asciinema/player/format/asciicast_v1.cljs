(ns asciinema.player.format.asciicast-v1
  (:require [schema.core :as s]
            [asciinema.player.vt :as vt]
            [asciinema.player.screen :as screen]))

(def StdoutFrame [(s/one s/Num "delay") (s/one s/Str "text to print")])

(def AsciicastV1 {:version s/Num
                  :width s/Num
                  :height s/Num
                  :duration s/Num
                  :command s/Str
                  :title s/Str
                  :env {s/Keyword s/Str}
                  :stdout [StdoutFrame]})

(s/defn reduce-v1-frame [[prev-time vt] [curr-time str]]
  (vector (+ prev-time curr-time) (vt/feed-str vt str)))

(defn build-v1-frames [{:keys [stdout width height]}]
  (let [vt (vt/make-vt width height)]
    (reductions reduce-v1-frame [0 vt] stdout)))

(s/defn initialize-asciicast
  [asciicast :- AsciicastV1]
  {:width (:width asciicast)
   :height (:height asciicast)
   :duration (reduce #(+ %1 (first %2)) 0 (:stdout asciicast))
   :frames (build-v1-frames asciicast)})

(extend-protocol screen/Screen
  vt/VT
  (lines [this]
    (vt/compact-lines (:lines this)))
  (cursor [this]
    (:cursor this)))
