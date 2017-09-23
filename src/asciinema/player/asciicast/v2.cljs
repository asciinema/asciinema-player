(ns asciinema.player.asciicast.v2
  (:require [asciinema.vt :as vt]
            [asciinema.player.frames :as frames]))

(defn reduce-vt [[_ vt] [curr-time str]]
  [curr-time (vt/feed-str vt str)])

(defn build-frames [events width height]
  (let [vt (vt/make-vt width height)]
    (->> events
         (filter #(= (second %) "o")) ; use only stdout events ("o")
         (map (juxt first #(nth % 2))) ; take timestamp + data for each
         (frames/at-hz 30 #(.concat %1 %2))
         (reductions reduce-vt [0 vt]))))

(defn initialize-asciicast [asciicast vt-width vt-height]
  (let [header (first asciicast)
        events (rest asciicast)
        width (or vt-width (:width header))
        height (or vt-height (:height header))]
    {:version 2
     :width width
     :height height
     :duration (-> events last first)
     :frames (build-frames events width height)}))
