(ns asciinema.player.frames-test
  (:require-macros [cljs.test :refer (is deftest)])
  (:require [cljs.test]
            [asciinema.player.frames :as f]))

(deftest test-interleave-frames
  (is (= (f/interleave-frames [[0.0 :a] [0.5 :b] [1.0 :c] [2.0 :d]]
                              [[0.1 :x] [0.3 :y] [0.7 :z]])
         [[0.0 :a] [0.1 :x] [0.3 :y] [0.5 :b] [0.7 :z] [1.0 :c] [2.0 :d]]))
  (is (= (f/interleave-frames [[0.0 :a] [0.5 :b] [1.0 :c] [2.0 :d]]
                              [[0.1 :x] [0.3 :y] [0.7 :z] [2.5 :zz] [3.0 :zzz]])
         [[0.0 :a] [0.1 :x] [0.3 :y] [0.5 :b] [0.7 :z] [1.0 :c] [2.0 :d]])))

(deftest test-frames-for-playback
  (is (= (f/frames-for-playback 5 2 [[0 :a] [2 :b] [4 :c] [6 :d] [8 :e] [10 :f] [12 :g]])
         [[0.5 :d] [1.5 :e] [2.5 :f] [3.5 :g]]))
  (is (= (f/frames-for-playback 4 1 [[0 :a] [2 :b] [4 :c] [6 :d] [8 :e] [10 :f] [12 :g]])
         [[0 :c] [2 :d] [4 :e] [6 :f] [8 :g]])))

(deftest test-frame-at
  (let [frames [[2 :foo] [5 :bar] [8 :baz]]]
    (is (= (f/frame-at 0 frames) nil))
    (is (= (f/frame-at 1 frames) nil))
    (is (= (f/frame-at 2 frames) [2 :foo]))
    (is (= (f/frame-at 3 frames) [2 :foo]))
    (is (= (f/frame-at 4 frames) [2 :foo]))
    (is (= (f/frame-at 5 frames) [5 :bar]))
    (is (= (f/frame-at 6 frames) [5 :bar]))
    (is (= (f/frame-at 7 frames) [5 :bar]))
    (is (= (f/frame-at 8 frames) [8 :baz]))
    (is (= (f/frame-at 9 frames) [8 :baz]))
    (is (= (f/frame-at 10 frames) [8 :baz]))))

(deftest test-skip-duplicates
  (is (= (f/skip-duplicates [[1 :a] [2 :b] [3 :b] [4 :b] [5 :c] [6 :d] [7 :d] [8 :e]])
         [[1 :a] [2 :b] [5 :c] [6 :d] [8 :e]]))
  (is (= (f/skip-duplicates [[1 :a] [2 :a] [3 :b] [4 :c] [5 :c]])
         [[1 :a] [3 :b] [4 :c]])))
