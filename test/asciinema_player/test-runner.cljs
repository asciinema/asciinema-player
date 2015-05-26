(ns asciinema-player.test-runner
  (:require
   [cljs.test :refer-macros [run-tests]]
   [asciinema-player.view-test]))

(enable-console-print!)

(defn runner []
  (if (cljs.test/successful?
       (run-tests
        'asciinema-player.view-test))
    0
    1))
