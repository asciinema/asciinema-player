(ns user
  (:require [schema.core :as s])
  (:use [figwheel-sidecar.repl-api :as ra]))

(s/set-fn-validation! true)

(defn start [] (ra/start-figwheel!))

(defn stop [] (ra/stop-figwheel!))

(defn cljs [] (ra/cljs-repl "dev"))
