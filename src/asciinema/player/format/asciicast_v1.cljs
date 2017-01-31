(ns asciinema.player.format.asciicast-v1
  (:require [schema.core :as s]
            [asciinema.vt :as vt]
            [asciinema.vt.screen :as screen]
            [asciinema.player.frames :as frames]
            [asciinema.player.screen :as ps]))

(def StdoutFrame [(s/one s/Num "delay") (s/one s/Str "text to print")])

(def AsciicastV1 {:version s/Num
                  :width s/Num
                  :height s/Num
                  :duration s/Num
                  :command s/Str
                  :title s/Str
                  :env {s/Keyword s/Str}
                  :stdout [StdoutFrame]})

(defn reduce-time [[prev-time _] [curr-time data]]
  [(+ prev-time curr-time) data])

(defn reduce-vt [[_ vt] [curr-time str]]
  [curr-time (vt/feed-str vt str)])

(defn- vt-lines [vt]
  (-> vt :screen screen/lines))

(defn- vt-cursor [vt]
  (-> vt :screen screen/cursor))

(defn- vt->map [vt]
  {:lines (vt-lines vt)
   :cursor (vt-cursor vt)})

(defn build-v1-frames [{:keys [stdout width height]}]
  (let [vt (vt/make-vt width height)]
    (->> stdout
         (reductions reduce-time)
         (frames/at-hz 30 #(.concat %1 %2))
         (reductions reduce-vt [0 vt])
         (frames/map-frame-data vt->map)
         frames/skip-duplicates)))

(s/defn initialize-asciicast
  [asciicast :- AsciicastV1]
  {:width (:width asciicast)
   :height (:height asciicast)
   :duration (reduce #(+ %1 (first %2)) 0 (:stdout asciicast))
   :frames (build-v1-frames asciicast)})

(extend-protocol ps/Screen
  vt/VT
  (lines [this]
    (vt-lines this))
  (cursor [this]
    (vt-cursor this)))
