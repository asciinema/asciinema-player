(ns player.test-runner
  (:require
   [cljs.test :refer-macros [run-tests]]
   [player.view-test]))

(enable-console-print!)

(defn runner []
  (if (cljs.test/successful?
       (run-tests
        'player.view-test))
    0
    1))
