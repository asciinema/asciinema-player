(ns asciinema.player.asciicast.v1
  (:require [asciinema.vt :as vt]
            [asciinema.player.frames :as frames]))

(defn- calc-duration [stdout idle-time-limit]
  (-> (comp (frames/cap-relative-time-xf idle-time-limit)
            (frames/to-absolute-time-xf))
      (sequence stdout)
      last
      first))

(defn build-frames [stdout width height idle-time-limit]
  (sequence (comp (frames/cap-relative-time-xf idle-time-limit)
                  (frames/to-absolute-time-xf)
                  (frames/data-reductions-xf vt/feed-str (vt/make-vt width height)))
            stdout))

(defn initialize-asciicast [asciicast vt-width vt-height idle-time-limit]
  (let [width (or vt-width (:width asciicast))
        height (or vt-height (:height asciicast))
        stdout (:stdout asciicast)]
    {:version 1
     :width width
     :height height
     :duration (calc-duration stdout idle-time-limit)
     :frames (build-frames stdout width height idle-time-limit)}))
