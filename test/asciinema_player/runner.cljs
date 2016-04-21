(ns asciinema-player.runner
  (:require [doo.runner :refer-macros [doo-tests]]
            [asciinema-player.core-test]
            [asciinema-player.view-test]
            [asciinema-player.vt-test]
            [asciinema-player.source-test]
            [asciinema-player.util-test]))

(enable-console-print!)

(doo-tests
  'asciinema-player.core-test
  'asciinema-player.view-test
  'asciinema-player.vt-test
  'asciinema-player.source-test
  'asciinema-player.util-test)
