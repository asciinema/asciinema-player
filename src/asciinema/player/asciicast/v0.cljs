(ns asciinema.player.asciicast.v0
  (:require [asciinema.vt.screen :as screen]
            [asciinema.player.frames :as frames]
            [asciinema.player.screen :as ps]))

(defrecord LegacyScreen [cursor lines])

(defn- calc-duration [frames idle-time-limit]
  (-> (comp (frames/cap-relative-time-xf idle-time-limit)
            (frames/to-absolute-time-xf))
      (sequence frames)
      last
      first))

(defn fix-line-diff-keys [line-diff]
  (into {} (map (fn [[k v]] [(js/parseInt (name k) 10) v]) line-diff)))

(defn reduce-screen [screen diff]
  (let [diff (update diff :lines fix-line-diff-keys)]
    (merge-with merge screen diff)))

(defn build-frames [diffs idle-time-limit]
  (let [screen (map->LegacyScreen {:lines (sorted-map)
                                   :cursor {:x 0 :y 0 :visible true}})]
    (sequence (comp (frames/cap-relative-time-xf idle-time-limit)
                    (frames/to-absolute-time-xf)
                    (frames/data-reductions-xf reduce-screen screen))
              diffs)))

(defn initialize-asciicast [asciicast idle-time-limit]
  (let [frame-0-lines (-> asciicast first last :lines)
        asciicast-width (->> frame-0-lines vals first (map #(count (first %))) (reduce +))
        asciicast-height (count frame-0-lines)]
    {:version 0
     :width asciicast-width
     :height asciicast-height
     :duration (calc-duration asciicast idle-time-limit)
     :frames (build-frames asciicast idle-time-limit)}))

(extend-protocol ps/Screen
  LegacyScreen
  (lines [this]
    (-> this :lines vals vec))
  (cursor [this]
    (:cursor this)))
