(ns asciinema-player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema-player.view :as view]
            [asciinema-player.util :as util]
            [cljs.core.async :refer [chan >! <!]])
  (:require-macros [cljs.core.async.macros :refer [go]]))

(defn make-player-state [snapshot]
  (atom {:width 80
   :height 24
   :current-time 23
   :duration 148.297910690308
   :font-size "small"
   :theme "solarized-dark"
   :lines snapshot }))

(defn toggle-play [state]
  (swap! state update-in [:playing] not))

(defn seek [state position]
  (swap! state assoc :current-time (* position (:duration @state))))

(defn create-player-with-state [state dom-node]
  (let [events (chan)]
    (go
      (loop []
        (let [[event & args] (<! events)]
          (case event
            :toggle-play (toggle-play state)
            :seek (seek state (first args))))
        (recur)))
    (reagent/render-component [view/player state events] dom-node)
    (clj->js {:toggle (fn [] toggle-play state)})))
