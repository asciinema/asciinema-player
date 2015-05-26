(ns asciinema-player.test-runner
  (:require
   [cljs.test :refer-macros [run-tests]]
   [asciinema-player.view-test]
   [asciinema-player.util-test]))

(enable-console-print!)

(defn runner []
  (run-tests
    'asciinema-player.view-test
    'asciinema-player.util-test))
