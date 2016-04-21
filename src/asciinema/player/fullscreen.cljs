(ns asciinema.player.fullscreen
  (:require [asciinema.player.util :as util]))

(defn is-fullscreen? []
  (let [options ["fullscreenElement"
                 "mozFullScreenElement"
                 "webkitFullscreenElement"
                 "webkitCurrentFullScreenElement"
                 "msFullscreenElement"]]
  (some (comp boolean util/document-prop) options)))

(defn request [dom-node]
  (let [options ["requestFullscreen"
                 "webkitRequestFullscreen"
                 "webkitRequestFullScreen"
                 "mozRequestFullScreen"
                 "msRequestFullscreen"]
        f (some (partial aget dom-node) options)]
    (if f
      (.call f dom-node))))

(defn exit []
  (let [options ["exitFullscreen"
                 "webkitExitFullscreen"
                 "webkitCancelFullScreen"
                 "mozCancelFullScreen"
                 "msExitFullscreen"]
        f (some util/document-prop options)]
    (if f
      (.call f js/document))))

(defn toggle [dom-node]
  (if (is-fullscreen?)
    (exit)
    (request dom-node)))
