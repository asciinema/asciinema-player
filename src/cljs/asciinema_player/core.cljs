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

(defn new-position [current-time total-time offset]
  (/ (util/adjust-to-range (+ current-time offset) 0 total-time) total-time))

(defn current-time [state]
  (:current-time @state))

(defn total-time [state]
  (:duration @state))

(defn process-event [[event-name & args] state]
  (case event-name
    :toggle-play (toggle-play state)
    :seek (seek state (first args))
    :rewind (seek state (new-position (current-time state) (total-time state) -5))
    :fast-forward (seek state (new-position (current-time state) (total-time state) 5))))

(defn create-player-with-state [state dom-node]
  (let [events (chan)
        dispatch (fn [event] (go (>! events event)))]
    (go-loop []
      (when-let [event (<! events)]
        (process-event event state)
        (recur)))
    (reagent/render-component [view/player state dispatch] dom-node)
    (clj->js {:toggle (fn [] toggle-play state)})))
