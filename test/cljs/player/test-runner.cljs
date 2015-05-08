(ns player.test-runner
  (:require
   [cljs.test :refer-macros [run-tests]]
   [player.core-test]))

(enable-console-print!)

(defn runner []
  (if (cljs.test/successful?
       (run-tests
        'player.core-test))
    0
    1))
