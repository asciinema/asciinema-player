(ns asciinema.player.frames
  (:require [asciinema.player.util :refer [reductions-xf]]))

(defn frame [time data]
  (vector time data))

(defn update-frame-data [f [time data]]
  (vector time (f data)))

(defn map-frame-data [f frames]
  (map #(update-frame-data f %) frames))

(defn interleave-frames
  "Returns lazy seq of interleaved frames coming from two collections."
  [frames1 frames2]
  (lazy-seq
   (when (seq frames1)
     (if (seq frames2)
       (let [[t1 _ :as f1] (first frames1)
             [t2 _ :as f2] (first frames2)]
         (if (< t1 t2)
           (cons f1 (interleave-frames (rest frames1) frames2))
           (cons f2 (interleave-frames frames1 (rest frames2)))))
       frames1))))

(defn translate-frame
  "Adjust frame time by given offset."
  [offset [time data]]
  (vector (+ time offset) data))

(defn accelerate-frame
  "Adjust frame time to match given speed."
  [speed [time data]]
  (vector (/ time speed) data))

(defn accelerate-xf [speed]
  (map (partial accelerate-frame speed)))

(defn cap-relative-time-xf [time-limit]
  (map (fn [[t data :as frame]]
         (if time-limit
           [(min t time-limit) data]
           frame))))

(defn frame-before?
  "Returns true if frame is scheduled before given time, otherwise returns
  false."
  [time frame]
  (< (first frame) time))

(defn frames-for-playback
  "Returns subset of frames starting from start-at, with given speed, with
  frame times relative to start-at."
  [start-at speed frames]
  (sequence (comp (drop-while (partial frame-before? start-at))
                  (map (partial translate-frame (- start-at)))
                  (accelerate-xf speed))
            frames))

(defn frame-before-or-at?
  "Returns true if frame is scheduled before or at given time, otherwise returns
  false."
  [time frame]
  (<= (first frame) time))

(defn frame-at
  "Returns frame at given time (or the last one before given time)."
  [seconds frames]
  (last (take-while (partial frame-before-or-at? seconds) frames)))

(defn- skip-duplicates* [v1 frames]
  (lazy-seq
   (loop [frames frames]
     (when (seq frames)
       (let [[_ v2 :as f2] (first frames)]
         (if (= v1 v2)
           (recur (rest frames))
           (cons f2 (skip-duplicates* v2 (rest frames)))))))))

(defn skip-duplicates
  "Returns frames with subsequent duplicate frames removed."
  [frames]
  (lazy-seq
   (let [[_ v1 :as f1] (first frames)]
     (cons f1 (skip-duplicates* v1 (next frames))))))

(defn at-hz
  "Returns frames at requested frame rate (hz)."
  [hz reduce-fn frames]
  (let [frame-time (/ 1.0 hz)]
    (letfn [(reduce-frames* [frames]
              (lazy-seq
               (when (seq frames)
                 (let [[t1 v1 :as f1] (first frames)
                       q1 (quot t1 frame-time)]
                   (loop [v1 v1
                          frames (rest frames)]
                     (if (seq frames)
                       (let [[t2 v2 :as f2] (first frames)
                             q2 (quot t2 frame-time)]
                         (if (= q1 q2)
                           (recur (reduce-fn v1 v2) (rest frames))
                           (cons [(* q1 frame-time) v1] (reduce-frames* frames))))
                       (cons [(* q1 frame-time) v1] nil)))))))]
      (reduce-frames* frames))))

(defn- reduce-frame [rf [_ acc] [time x]]
  [time (rf acc x)])

(defn data-reductions-xf [f init]
  (reductions-xf #(reduce-frame f %1 %2) [0 init]))

(defn to-absolute-time-xf []
  (reductions-xf (fn [[prev-time _] [curr-time data]]
                   [(+ prev-time curr-time) data])))

(defn to-absolute-time [frames]
  (sequence (to-absolute-time-xf) frames))

(defn to-relative-time-xf []
  (fn [rf]
    (let [base-time (volatile! 0)]
      (fn
        ([] (rf))
        ([acc] (rf acc))
        ([acc [t v]]
         (let [delta (- t @base-time)]
           (vreset! base-time t)
           (rf acc [delta v])))))))

(defn to-relative-time [frames]
  (sequence (to-relative-time-xf) frames))
