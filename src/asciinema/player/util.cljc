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
