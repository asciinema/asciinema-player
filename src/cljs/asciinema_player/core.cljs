(ns asciinema-player.core
  (:require [reagent.core :as reagent :refer [atom]]
            [asciinema-player.view :as view]
            [asciinema-player.util :as util]
            [cljs.core.async :refer [chan >! <! timeout close!]]
            [clojure.walk :as walk]
            [ajax.core :refer [GET]])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(defn make-player-state [snapshot]
  (atom {
         :width 80
         :height 24
         :duration 148.297910690308
         :frames-url "/frames.json"
         :font-size "small"
         :theme "seti"
         :lines (into (sorted-map) (map-indexed vector snapshot))
         :cursor {:on true}
         :play-from 0
         :current-time 0
         :autoplay false
         :loop false
         :speed 1.0}))

(defn apply-diff [state {:keys [lines cursor]}]
  (merge-with merge state {:lines lines :cursor cursor}))

(defn coll->chan [coll]
  (let [ch (chan)]
    (go
      (loop [coll coll]
        (when-let [[delay data] (first coll)]
          (<! (timeout (* 1000 delay)))
          (>! ch data)
          (recur (rest coll))))
      (close! ch))
    ch))

(defn prev-diff [frames seconds]
  (loop [frames frames
         seconds seconds
         candidate nil]
    (let [[delay diff :as frame] (first frames)]
      (if (or (nil? frame) (< seconds delay))
        candidate
        (recur (rest frames) (- seconds delay) (merge-with merge candidate diff))))))

(defn next-frames [frames seconds]
  (lazy-seq
    (if (seq frames)
      (let [[delay diff] (first frames)]
        (if (<= delay seconds)
          (next-frames (rest frames) (- seconds delay))
          (cons [(- delay seconds) diff] (rest frames))))
      frames)))

(defn elapsed-time-since [then]
  (/ (- (.getTime (js/Date.)) (.getTime then)) 1000))

(defn frames-at-speed [frames speed]
  (map (fn [[delay diff]] [(/ delay speed) diff]) frames))

(defn reset-blink [state]
  (assoc-in state [:cursor :on] true))

(defn make-cursor-blink-chan []
  (coll->chan (cycle [[0.5 false] [0.5 true]])))

(defn start-playback [state dispatch]
  (let [start (js/Date.)
        play-from (:play-from state)
        speed (:speed state)
        frames (-> (:frames state) (next-frames play-from) (frames-at-speed speed))
        diff-chan (coll->chan frames)
        timer-chan (coll->chan (repeat [0.3 true]))
        stop-playback-chan (chan)
        elapsed-time #(* (elapsed-time-since start) speed)
        stop-fn (fn []
                  (close! stop-playback-chan)
                  (elapsed-time))]
    (go-loop [cursor-blink-chan (make-cursor-blink-chan)]
      (let [[v c] (alts! [diff-chan timer-chan cursor-blink-chan stop-playback-chan])]
        (condp = c
          timer-chan (let [t (+ play-from (elapsed-time))]
                       (dispatch [:update-state assoc :current-time t])
                       (recur cursor-blink-chan))
          cursor-blink-chan (do
                              (dispatch [:update-state assoc-in [:cursor :on] v])
                              (recur cursor-blink-chan))
          diff-chan (if v
                         (do
                           (dispatch [:update-state #(-> % (apply-diff v) reset-blink)])
                           (recur (make-cursor-blink-chan)))
                         (do
                           (dispatch [:finished])
                           (print (str "finished in " (elapsed-time-since start)))))
          stop-playback-chan nil))) ; do nothing, break the loop
    (-> state
        (apply-diff (prev-diff (:frames state) play-from))
        (assoc :stop stop-fn))))

(defn stop-playback [state]
  (let [t ((:stop state))]
    (-> state
        (dissoc :stop)
        (update-in [:play-from] + t))))

(defn- fix-line-diff-keys [line]
  (into {} (map (fn [[k v]] [(js/parseInt (name k) 10) v]) line)))

(defn- fix-diff-keys [frame]
  (update-in frame [1 :lines] fix-line-diff-keys))

(defn frames-json->clj [frames]
  (map fix-diff-keys (walk/keywordize-keys frames)))

(defn fetch-frames [state dispatch]
  (let [url (:frames-url state)]
    (GET
     url
     {:format :json
      :handler #(dispatch [:frames-response %])
      :error-handler #(dispatch [:bad-response %])})
    (assoc state :loading true)))

(defn new-position [current-time total-time offset]
  (/ (util/adjust-to-range (+ current-time offset) 0 total-time) total-time))

(defn handle-toggle-play [state dispatch]
  (if (contains? state :frames)
    (if (contains? state :stop)
      (stop-playback state)
      (start-playback state dispatch))
    (fetch-frames state dispatch)))

(defn handle-seek [state dispatch [position]]
  (let [new-time (* position (:duration state))
        diff (prev-diff (:frames state) new-time)
        playing? (contains? state :stop)]
    (when playing?
      ((:stop state)))
    (let [new-state (-> state
                        (assoc :current-time new-time :play-from new-time)
                        (apply-diff diff))]
      (if playing?
        (start-playback new-state dispatch)
        new-state))))

(defn handle-rewind [state dispatch]
  (let [position (new-position (:current-time state) (:duration state) -5)]
    (handle-seek state dispatch [position])))

(defn handle-fast-forward [state dispatch]
  (let [position (new-position (:current-time state) (:duration state) 5)]
    (handle-seek state dispatch [position])))

(defn handle-finished [state dispatch]
  (when (:loop state)
    (dispatch [:toggle-play]))
  (-> state (dissoc :stop) (assoc :play-from 0)))

(defn speed-up [speed]
  (* speed 2))

(defn speed-down [speed]
  (/ speed 2))

(defn handle-speed-change [change-fn state dispatch]
  (if-let [stop (:stop state)]
    (let [t (stop)]
      (-> state
          (update-in [:play-from] + t)
          (update-in [:speed] change-fn)
          (start-playback dispatch)))
    (update-in state [:speed] change-fn)))

(defn handle-frames-response [state dispatch [frames-json]]
  (dispatch [:toggle-play])
  (assoc state :loading false
               :frames (frames-json->clj frames-json)))

(defn handle-update-state [state _ [f & args]]
  (apply f state args))

(def event-handlers {:toggle-play handle-toggle-play
                     :seek handle-seek
                     :rewind handle-rewind
                     :fast-forward handle-fast-forward
                     :finished handle-finished
                     :speed-up (partial handle-speed-change speed-up)
                     :speed-down (partial handle-speed-change speed-down)
                     :frames-response handle-frames-response
                     :update-state handle-update-state})

(defn process-event [state dispatch [event-name & args]]
  (if-let [handler (get event-handlers event-name)]
    (swap! state handler dispatch args)
    (print (str "unhandled event: " event-name))))

(defn create-player-with-state [state dom-node]
  (let [events (chan)
        dispatch (fn [event] (go (>! events event)))]
    (go-loop []
      (when-let [event (<! events)]
        (process-event state dispatch event)
        (recur)))
    (reagent/render-component [view/player state dispatch] dom-node)
    (when (:autoplay @state)
      (dispatch [:toggle-play]))
    (clj->js {:toggle (fn [] true)})))
