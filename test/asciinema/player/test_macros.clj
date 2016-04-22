(ns asciinema.player.test-macros
  (:require [environ.core :refer [env]]))

(defmacro property-tests-multiplier []
  (let [multiplier-str (get env :property-tests-multiplier "1")]
    (Integer/parseInt multiplier-str)))
