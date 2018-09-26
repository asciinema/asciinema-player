(ns asciinema.player.asciicast.v2
  (:require [asciinema.vt :as vt]
            [asciinema.player.frames :as frames]))

(defn- calc-duration [events idle-time-limit]
  (-> (comp (frames/to-relative-time-xf)
            (frames/cap-relative-time-xf idle-time-limit)
            (frames/to-absolute-time-xf))
      (sequence events)
      last
      first))

(defn build-xf [width height idle-time-limit]
  (comp (filter #(= (second %) "o")) ; use only stdout events ("o")
        (map (juxt first #(nth % 2))) ; take timestamp + data for each
        (frames/to-relative-time-xf)
        (frames/cap-relative-time-xf idle-time-limit)
        (frames/to-absolute-time-xf)
        (frames/data-reductions-xf vt/feed-str (vt/make-vt width height))))

(defn initialize-asciicast [asciicast vt-width vt-height idle-time-limit]
  (let [header (first asciicast)
        events (rest asciicast)
        width (or vt-width (:width header))
        height (or vt-height (:height header))
        idle-time-limit (or idle-time-limit (:idle_time_limit header))
        xf (build-xf width height idle-time-limit)]
    {:version 2
     :width width
     :height height
     :duration (calc-duration events idle-time-limit)
     :xf xf
     :data events
     :frames (sequence xf events)}))
