(ns asciinema.player.js
  (:require [clojure.set :refer [rename-keys]]
            [asciinema.player.core :as p]))

(defn ^:export CreatePlayer
  "JavaScript API for creating the player."
  ([dom-node url] (CreatePlayer dom-node url {}))
  ([dom-node url options]
   (let [options (-> options
                     (js->clj :keywordize-keys true)
                     (rename-keys {:autoPlay :auto-play
                                   :fontSize :font-size
                                   :snapshot :poster
                                   :authorURL :author-url
                                   :startAt :start-at
                                   :authorImgURL :author-img-url}))]
     (p/create-player dom-node url options))))
