(ns asciinema-player.test-runner
  (:require
   [cljs.test :refer-macros [run-tests]]
   [asciinema-player.core-test]
   [asciinema-player.view-test]
   [asciinema-player.vt-test]
   [asciinema-player.util-test]))

(enable-console-print!)

; TODO: hook this with phantomjs runner
; (defmethod cljs.test/report [:cljs.test/default :end-run-tests] [m]
;   (if (cljs.test/successful? m)
;     (println "Success!")
;     (println "FAIL")))

(defn runner []
  (run-tests
    'asciinema-player.core-test
    'asciinema-player.view-test
    'asciinema-player.vt-test
    'asciinema-player.util-test))
