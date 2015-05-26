(ns asciinema-player.util)

(defn adjust-to-range [value min-value max-value]
  (.min js/Math max-value (.max js/Math value min-value)))
