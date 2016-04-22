(ns asciinema.player.patch
  (:refer-clojure :exclude [js->clj]))

; Optimized js->clj implementation by Darrick Wiebe (http://dev.clojure.org/jira/browse/CLJS-844)
(defn js->clj
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
