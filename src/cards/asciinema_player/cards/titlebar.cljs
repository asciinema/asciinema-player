(ns asciinema-player.cards.titlebar
  (:require [asciinema-player.core :as c]
            [asciinema-player.view :as v])
  (:require-macros [devcards.core :as dc :refer [defcard]]))

(defonce state-1 (c/make-player-ratom "/asciicasts/frames-10386.json" {}))
(defonce dispatch-1 (c/start-event-loop! state-1))

(swap! state-1 assoc :title "This is looooooooooooooooooooooooooooooooooooooooong title for such a narrow terminal")

(defcard player-with-title
  (dc/reagent [v/player state-1 dispatch-1]))

(defonce state-2 (c/make-player-ratom "/asciicasts/21195.json" {}))
(defonce dispatch-2 (c/start-event-loop! state-2))

(swap! state-2 assoc :title "This is looooooooooooooooooooooooooooooooooooooooong title for such a narrow terminal")
(swap! state-2 assoc :author-img-url "https://gravatar.com/avatar/2807e23da22a140cf573ea75b37d11f6?s=128&d=retro")

(defcard player-with-title-and-author-avatar
  (dc/reagent [v/player state-2 dispatch-2]))
