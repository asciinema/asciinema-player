(ns asciinema-player.cards
  (:require [asciinema-player.core :as c]
            [asciinema-player.view :as v])
  (:require-macros [devcards.core :as dc :refer [defcard]]))

;; "emacs"

(defonce state-1 (c/make-player-ratom 80 24 "/frames-10386.json" 148.297910690308 {}))
(defonce dispatch-1 (c/start-event-loop! state-1))

(swap! state-1 assoc :theme "asciinema")

(defcard emacs-card
  (dc/reagent [v/player state-1 dispatch-1]))

;; "fractals"

(defonce state-2 (c/make-player-ratom 80 24 "/frames-20055.json" 38.91 {}))
(defonce dispatch-2 (c/start-event-loop! state-2))

(defcard fractals-card
  (dc/reagent [v/player state-2 dispatch-2]))

;; "catimg"

(defonce state-3 (c/make-player-ratom 100 41 "/frames-26491.json" 12.318521 {}))
(defonce dispatch-3 (c/start-event-loop! state-3))

(defcard catimg-card
  (dc/reagent [v/player state-3 dispatch-3]))

;; "color table"

(defonce state-4a (c/make-player-ratom 84 31 "/frames-color-test.json" 4.533024 {}))
(defonce dispatch-4a (c/start-event-loop! state-4a))

(defcard color-table-on-tango
  (dc/reagent [v/player state-4a dispatch-4a]))

(swap! state-4a assoc :theme "tango")

(defonce state-4 (c/make-player-ratom 84 31 "/frames-color-test.json" 4.533024 {}))
(defonce dispatch-4 (c/start-event-loop! state-4))

(defcard color-table-on-asciinema
  (dc/reagent [v/player state-4 dispatch-4]))

(swap! state-4 assoc :theme "asciinema")

(defonce state-5 (c/make-player-ratom 84 31 "/frames-color-test.json" 4.533024 {}))
(defonce dispatch-5 (c/start-event-loop! state-5))

(defcard color-table-on-seti
  (dc/reagent [v/player state-5 dispatch-5]))

(swap! state-5 assoc :theme "seti")

(defonce state-6 (c/make-player-ratom 84 31 "/frames-color-test.json" 4.533024 {}))
(defonce dispatch-6 (c/start-event-loop! state-6))

(defcard color-table-on-monokai
  (dc/reagent [v/player state-6 dispatch-6]))

(swap! state-6 assoc :theme "monokai")
