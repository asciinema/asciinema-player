(ns asciinema-player.util
  (:refer-clojure :exclude [js->clj]))

(defn adjust-to-range [value min-value max-value]
  (min max-value (max value min-value)))

; Optimized js->clj implementation by Darrick Wiebe (http://dev.clojure.org/jira/browse/CLJS-844)
(defn js->clj
  "Recursively transforms JavaScript arrays into ClojureScript
  vectors, and JavaScript objects into ClojureScript maps.  With
  option ':keywordize-keys true' will convert object fields from
  strings to keywords."
  ([x] (js->clj x :keywordize-keys false))
  ([x & opts]
   (cond
     (satisfies? IEncodeClojure x)
     (-js->clj x (apply array-map opts))
     (seq opts)
     (let [{:keys [keywordize-keys]} opts
           keyfn (if keywordize-keys keyword str)
           f (fn thisfn [x]
               (cond
                 (seq? x)
                 (doall (map thisfn x))
                 (coll? x)
                 (into (empty x) (map thisfn) x)
                 (array? x)
                 (persistent!
                  (reduce #(conj! %1 (thisfn %2))
                          (transient []) x))
                 (identical? (type x) js/Object)
                 (persistent!
                  (reduce (fn [r k] (assoc! r (keyfn k) (thisfn (aget x k))))
                          (transient {}) (js-keys x)))
                 :else x))]
       (f x)))))

(defn elapsed-time-since
  "Returns wall time (in seconds) elapsed since 'then'."
  [then]
  (/ (- (.getTime (js/Date.)) (.getTime then)) 1000))

(defn timer
  "Returns a function returning elapsed time since timer's creation."
  ([] (timer 1))
  ([speed]
   (let [start-date (js/Date.)]
     (fn []
       (* (elapsed-time-since start-date) speed)))))

(defn document-prop [name]
  (aget js/document name))

(defn window-prop [name]
  (aget js/window name))
