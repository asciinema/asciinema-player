(ns asciinema.player.frames)

(defn frame [time data]
  (vector time data))

(defn update-frame-data [f [time data]]
  (vector time (f data)))

(defn map-frame-data [f frames]
  (map (partial update-frame-data f) frames))

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
                  (map (partial accelerate-frame speed)))
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
