(ns asciinema-player.util)

(defn adjust-to-range [value min-value max-value]
  (.min js/Math max-value (.max js/Math value min-value)))

; Optimized js->clj implementation by Darrick Wiebe (http://dev.clojure.org/jira/browse/CLJS-844)
(defn faster-js->clj
  "Recursively transforms JavaScript arrays into ClojureScript
  vectors, and JavaScript objects into ClojureScript maps.  With
  option ':keywordize-keys true' will convert object fields from
  strings to keywords."
  ([x] (faster-js->clj x {:keywordize-keys false}))
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
