(ns player.dev
    (:require [environ.core :refer [env]]))

(if (env :is-dev)
  (throw (Exception. (str "Production environment code is being loaded while the dev environment is active. "
                          "You likely have compiled class files lying around from an uberjar build. "
                          "Remove the target/ directory and try again."))))

(def is-dev? false)
(def inject-devmode-html identity)
(defn browser-repl []
  (throw (Exception. "Browser connected REPL is not available in prod mode")))
(defn start-figwheel []
  (throw (Exception. "Figwheel is not available in prod mode")))

(defn start-less []
  (throw (Exception. "less is not available in prod mode")))
