(ns asciinema.vt.parser
  (:require [schema.core :as s #?@(:cljs [:include-macros true])]
            #?(:clj [asciinema.vt.parser-macros :refer [build-lookup-table]]))
  #?(:cljs (:require-macros [asciinema.vt.parser-macros :refer [build-lookup-table]])))

(s/defschema Parser {:state s/Keyword
                     :intermediate-chars [s/Num]
                     :param-chars [s/Num]})

(def states (build-lookup-table))

(defn parse [current-state input]
  (let [input (if (>= input 0xa0) 0x41 input)]
    (-> states current-state (get input))))
