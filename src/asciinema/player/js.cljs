(ns asciinema.player.js
  (:require [clojure.set :refer [rename-keys]]
            [asciinema.player.core :as p]
            [asciinema.player.element])) ; DON'T REMOVE

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
                                   :onPause :on-pause
                                   :onEnded :on-ended}))
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

;; This has to be executed *after* asciinema.player.js.CreatePlayer is defined,
;; as browsers implementing CustomElement natively (like Chrome) call element's
;; attachedCallback synchronously.

(js/registerAsciinemaPlayerElement)
