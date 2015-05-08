(ns player.server
  (:require [clojure.java.io :as io]
            [player.dev :refer [is-dev? inject-devmode-html browser-repl start-figwheel start-less]]
            [compojure.core :refer [GET defroutes]]
            [compojure.route :refer [resources not-found]]
            [net.cgrand.enlive-html :refer [deftemplate]]
            [net.cgrand.reload :refer [auto-reload]]
            [ring.middleware.reload :as reload]
            [ring.middleware.defaults :refer [wrap-defaults api-defaults]]
            [environ.core :refer [env]]
            [ring.adapter.jetty :refer [run-jetty]]))

(deftemplate home-page (io/resource "index.html") [& args]
  [:body] (if is-dev? inject-devmode-html identity))

(defroutes routes
  (GET "/" [] home-page)
  (resources "/")
  ; (resources "/react") ; {:root "react"})
  ; (GET "/*" req (page)))
  (not-found "Not3 Found"))

(def http-handler
  (if is-dev?
    (reload/wrap-reload (wrap-defaults #'routes api-defaults))
    (wrap-defaults routes api-defaults)))

(defn run-web-server [& [port]]
  (let [port (Integer. (or port (env :port) 10555))]
    (print "Starting web server on port" port ".\n")
    (run-jetty http-handler {:port port :join? false})))

(defn run-auto-reload [& [port]]
  (auto-reload *ns*)
  (start-figwheel)
  (start-less))

(defn run [& [port]]
  (when is-dev?
    (run-auto-reload))
  (run-web-server port))

(defn -main [& [port]]
  (run port))
