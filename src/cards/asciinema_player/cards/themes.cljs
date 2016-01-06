(ns asciinema-player.cards.themes
  (:require [asciinema-player.core :as c]
            [asciinema-player.view :as v])
  (:require-macros [devcards.core :as dc :refer [defcard]]))

;; "emacs"

(defonce state-1 (c/make-player-ratom "/asciicasts/frames-10386.json" {}))
(defonce dispatch-1 (c/start-event-loop! state-1))

(swap! state-1 assoc :theme "asciinema")

(defcard emacs-with-asciinema-theme
  (dc/reagent [v/player state-1 dispatch-1]))

;; "fractals"

(defonce state-2 (c/make-player-ratom "/asciicasts/frames-20055.json" {}))
(defonce dispatch-2 (c/start-event-loop! state-2))

(defcard fractals-with-default-theme
  (dc/reagent [v/player state-2 dispatch-2]))

;; "catimg"

(defonce state-3 (c/make-player-ratom "/asciicasts/frames-26491.json" {}))
(defonce dispatch-3 (c/start-event-loop! state-3))

(defcard catimg-with-default-theme
  (dc/reagent [v/player state-3 dispatch-3]))

;; "color table"

(defonce state-4a (c/make-player-ratom "/asciicasts/frames-color-test.json" {}))
(defonce dispatch-4a (c/start-event-loop! state-4a))

(defcard color-table-with-tango-theme
  (dc/reagent [v/player state-4a dispatch-4a]))

(swap! state-4a assoc :theme "tango")

(defonce state-4 (c/make-player-ratom "/asciicasts/frames-color-test.json" {}))
(defonce dispatch-4 (c/start-event-loop! state-4))

(defcard color-table-with-asciinema-theme
  (dc/reagent [v/player state-4 dispatch-4]))

(swap! state-4 assoc :theme "asciinema")

(defonce state-5 (c/make-player-ratom "/asciicasts/frames-color-test.json" {}))
(defonce dispatch-5 (c/start-event-loop! state-5))

(defcard color-table-with-seti-theme
  (dc/reagent [v/player state-5 dispatch-5]))

(swap! state-5 assoc :theme "seti")

(defonce state-6 (c/make-player-ratom "/asciicasts/frames-color-test.json" {}))
(defonce dispatch-6 (c/start-event-loop! state-6))

(defcard color-table-with-monokai-theme
  (dc/reagent [v/player state-6 dispatch-6]))

(swap! state-6 assoc :theme "monokai")
