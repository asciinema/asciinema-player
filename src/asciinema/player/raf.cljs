(ns asciinema.player.raf
  (:require [asciinema.player.util :as util]))

(def request-animation-frame
  (or (util/window-prop "requestAnimationFrame") (fn [f] (f))))
