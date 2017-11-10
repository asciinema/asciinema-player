(ns asciinema.player.util
  #?(:cljs (:refer-clojure :exclude [js->clj])))

(defn adjust-to-range [value min-value max-value]
  (min max-value (max value min-value)))

#?(:cljs
   (defn elapsed-time-since
     "Returns wall time (in seconds) elapsed since 'then'."
     [then]
     (/ (- (.getTime (js/Date.)) (.getTime then)) 1000)))

#?(:cljs
   (defn timer
     "Returns a function returning elapsed time since timer's creation."
     ([] (timer 1))
     ([speed]
      (let [start-date (js/Date.)]
        (fn []
          (* (elapsed-time-since start-date) speed))))))

#?(:cljs
   (defn document-prop [name]
     (aget js/document name)))

#?(:cljs
   (defn window-prop [name]
     (aget js/window name)))

(defn reductions-xf
  "Transducer version of reductions. Inspired by https://github.com/cgrand/xforms/blob/37d47321177ba7f027097d490004f084a91e1997/src/net/cgrand/xforms.cljc#L408"
  ([f]
   (fn [rf]
     (let [prev (volatile! nil)]
       (vreset! prev prev)
       (fn
         ([] (rf))
         ([acc] (if (identical? @prev prev)
                  acc
                  (rf acc)))
         ([acc x]
          (if (identical? @prev prev)
            (rf acc (vreset! prev x))
            (let [curr (vswap! prev f x)]
              (if (reduced? curr)
                (ensure-reduced (rf acc @curr))
                (rf acc curr)))))))))
  ([f init]
   (fn [rf]
     (let [prev (volatile! nil)]
       (vreset! prev prev)
       (fn
         ([] (rf))
         ([acc] (if (identical? @prev prev)
                  (rf (unreduced (rf acc init)))
                  (rf acc)))
         ([acc x]
          (if (identical? @prev prev)
            (let [acc (rf acc (vreset! prev init))]
              (if (reduced? acc)
                acc
                (recur acc x)))
            (let [curr (vswap! prev f x)]
              (if (reduced? curr)
                (ensure-reduced (rf acc @curr))
                (rf acc curr))))))))))
