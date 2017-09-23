(ns asciinema.player.asciicast.v1
  (:require [schema.core :as s]
            [asciinema.vt :as vt]
            [asciinema.player.frames :as frames]))

(def StdoutFrame [(s/one s/Num "delay") (s/one s/Str "text to print")])

(def AsciicastV1 {:version s/Num
                  :width s/Num
                  :height s/Num
                  :duration s/Num
                  :command s/Str
                  :title s/Str
                  :env {s/Keyword s/Str}
                  :stdout [StdoutFrame]})

(defn reduce-vt [[_ vt] [curr-time str]]
  [curr-time (vt/feed-str vt str)])

(defn build-v1-frames [stdout width height]
  (let [vt (vt/make-vt width height)]
    (->> stdout
         frames/to-absolute-time
         (frames/at-hz 30 #(.concat %1 %2))
         (reductions reduce-vt [0 vt]))))

(s/defn initialize-asciicast
  [asciicast :- AsciicastV1
   vt-width :- s/Num
   vt-height :- s/Num]
  (let [width (or vt-width (:width asciicast))
        height (or vt-height (:height asciicast))
        stdout (:stdout asciicast)]
    {:version 1
     :width width
     :height height
     :duration (reduce #(+ %1 (first %2)) 0 stdout)
     :frames (build-v1-frames stdout width height)}))
