(ns asciinema.player.vt-test
  (:require [environ.core :refer [env]]))

(defmacro property-tests-multiplier []
  (let [multiplier-str (get env :property-tests-multiplier "1")]
    (Integer/parseInt multiplier-str)))
