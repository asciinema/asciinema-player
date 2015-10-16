(ns asciinema-player.cards
  (:require [asciinema-player.core :as c]
            [asciinema-player.view :as v])
  (:require-macros [devcards.core :as dc :refer [defcard]]))

(defonce state-1 (c/make-player-ratom 80 24 "/frames-10386.json" 148.297910690308 {}))
(defonce dispatch-1 (c/start-event-loop! state-1))

(defcard my-second-card
  (dc/reagent [v/player state-1 dispatch-1]))

(defonce state-2 (c/make-player-ratom 84 31 "/frames-color-test.json" 4.533024 {}))
(defonce dispatch-2 (c/start-event-loop! state-2))

(defcard my-third-card
  (dc/reagent [v/player state-2 dispatch-2]))
