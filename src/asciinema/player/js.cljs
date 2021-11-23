(ns asciinema.player.js
  (:require [clojure.set :refer [rename-keys]]
            [goog.net.XhrIo :as xhr]
            [cljs.core.async :refer [chan >! <! put!]]
            [asciinema.vt :as vt]
            [asciinema.player.asciicast :as asciicast]
            [asciinema.player.core :as p]
            [asciinema.player.element])
  (:require-macros [cljs.core.async.macros :refer [go]])) ; DON'T REMOVE

(defn ^:export CreatePlayer
  "JavaScript API for creating the player."
  ([dom-node url] (CreatePlayer dom-node url {}))
  ([dom-node url options]
   (let [url (js->clj url :keywordize-keys true)
         options (-> options
                     (js->clj :keywordize-keys true)
                     (rename-keys {:autoPlay :auto-play
                                   :fontSize :font-size
                                   :snapshot :poster
                                   :authorURL :author-url
                                   :startAt :start-at
                                   :authorImgURL :author-img-url
                                   :idleTimeLimit :idle-time-limit
                                   :onCanPlay :on-can-play
                                   :onPlay :on-play
                                   :onPause :on-pause}))
         player (p/create-player dom-node url options)]
     (clj->js {:getCurrentTime #(p/get-current-time @player)
               :setCurrentTime #(p/seek @player %)
               :getDuration #(p/get-duration @player)
               :play #(p/play @player)
               :pause #(p/pause @player)}))))

(defn ^:export UnmountPlayer
  "JavaScript API for unmounting the player from given DOM node."
  [dom-node]
  (p/unmount-player dom-node))

(defn fetch [url]
  (let [ch (chan)]
    (xhr/send url (fn [event]
                    (put! ch (-> event
                                 .-target
                                 .getResponseText))))
    ch))

(defn byte-size [s]
  (.-size (new js/Blob [s])))

(defn ^:export benchmark [url rounds]
  (go
    (let [body (<! (fetch url))
          asciicast (asciicast/load body)
          vt (vt/make-vt (:width asciicast) (:height asciicast))
          strings (map #(or (get % 2) (get % 1)) (:data asciicast))
          bytes (* (reduce #(+ %1 (byte-size %2)) 0 strings) rounds)
          frames (map (fn [string] (mapv #(.codePointAt string %) (range (count string)))) strings)]
      (prn "bytes: " bytes)
      (time
        (dotimes [_ rounds]
         (loop [vt vt
                frames frames]
           (if-let [inputs (first frames)]
             (recur (vt/feed vt inputs) (rest frames))
             vt)))))))

;; This has to be executed *after* asciinema.player.js.CreatePlayer is defined,
;; as browsers implementing CustomElement natively (like Chrome) call element's
;; attachedCallback synchronously.

(js/registerAsciinemaPlayerElement)
