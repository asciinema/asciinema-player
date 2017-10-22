(ns asciinema.player.asciicast.v2
  (:require [asciinema.vt :as vt]
            [asciinema.player.frames :as frames]))

(defn build-frames [events width height]
  (sequence (comp
             (filter #(= (second %) "o")) ; use only stdout events ("o")
             (map (juxt first #(nth % 2))) ; take timestamp + data for each
             (frames/data-reductions-xf vt/feed-str (vt/make-vt width height)))
            events))

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
