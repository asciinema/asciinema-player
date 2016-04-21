(ns asciinema.player.vt
  (:require [clojure.string :as string]))

(defn event-seq [event]
  (if (keyword? event)
    (let [[low high] (string/split (name event) #"-")
          low (Long/decode low)
          high (Long/decode high)]
      (range low (inc high)))
    [event]))

(defmacro events [& items]
  `(set '~(mapcat event-seq items)))
