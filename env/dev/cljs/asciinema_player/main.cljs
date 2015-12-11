(ns asciinema-player.main
  (:require [asciinema-player.core :as p]
            [asciinema-player.vt :as vt]
            [asciinema-player.util :as util]
            [clojure.walk :as walk]
            [cljs.core.async :refer [chan >! <! put!]]
            [ajax.core :refer [GET]])
  (:require-macros [cljs.core.async.macros :refer [go]]))

(defonce snapshot-js [[["File Edit Options Buffers Tools C++ YASnippet Help                              " {"inverse" true}]] [["/" {"fg" 1, "inverse" true}] ["* Copyright (c) 2014 Vinícius dos San" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["/* Copyright (c) 2014 Vinícius dos Sant" {"fg" 1}] ["$" {}]] [["                                       " {"fg" 1}] ["|" {"inverse" true}] ["                                        " {"fg" 1}]] [["   Distributed under the Boost Softwar" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   Distributed under the Boost Software" {"fg" 1}] ["$" {}]] [["   file LICENSE_1_0.txt or copy at htt" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   file LICENSE_1_0.txt or copy at http" {"fg" 1}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOC$" {}] ["|" {"inverse" true}] ["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOCK$" {}]] [["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOC" {"fg" 3}] ["$" {}] ["|" {"inverse" true}] ["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOCK" {"fg" 3}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                     " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                      " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                   " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                    " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["       " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["        " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hp" {"fg" 2}] ["$" {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hpp" {"fg" 2}] ["$" {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["       " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["     " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["// TODO: remove me                     " {"fg" 1}] ["|" {"inverse" true}] ["// TODO: remove me                      " {"fg" 1}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                     " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                       " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] ["|-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] [" " {"inverse" true}]] [["                                                                                " {}]]])

(defonce snapshot (walk/keywordize-keys snapshot-js))
(defonce options {:speed 1
                  :title "Something cool"
                  :author "sickill"
                  :author-url "http://ku1ik.com/"
                  :author-img-url "https://gravatar.com/avatar/2807e23da22a140cf573ea75b37d11f6?s=128&d=retro"})

;; "emacs"

(defonce player-state
  (p/make-player-ratom 80 24 "/frames-10386.json" 148.297910690308 (merge options {:snapshot snapshot})))

;; (add-watch player-state :foo (fn [_ id old new] (prn (-> new (dissoc :lines) (dissoc :snapshot) (dissoc :frames)))))

;; "fractals"

;; (defonce player-state
;;   (p/make-player-ratom 80 24 "/frames-20055.json" 38.91 options))

;; (defonce player-state
;;   (p/make-player-ratom 80 24 "/20055.json" 38.91 options))

;; (defonce player-state
;;   (p/make-player-ratom 79 22 "/21195.json" 42 options))

;; (defonce player-state
;;   (p/make-player-ratom 79 22 "/frames-21195.json" 42 options))

;; "catimg"

;; (defonce player-state
;;   (p/make-player-ratom 100 41 "/frames-26491.json" 12.318521 options))

;; "color table"

;; (defonce player-state
;;   (p/make-player-ratom 84 31 "/frames-color-test.json" 4.533024 options))

;; (swap! player-state assoc :theme "solarized-dark")
;; (swap! player-state assoc :theme "solarized-light")
;; (swap! player-state assoc :theme "tango")
;; (swap! player-state assoc :theme "seti")
;; (swap! player-state assoc :current-time 45)
;; (swap! player-state assoc :font-size "small")
;; (swap! player-state assoc :speed 1)

(defonce reload-fn (atom nil))

(defn reload []
  (@reload-fn))

(defn reload-player []
  (p/create-player-with-state player-state (. js/document (getElementById "player"))))

(defn start-dev []
  (reset! reload-fn reload-player)
  (reload-player))

(def v0-url "/frames-21195.json")
(def v1-url "/21195.json")

(defn fetch-json [url]
  (let [ch (chan)]
    (GET url
         {:response-format :raw
          :handler (fn [res]
                     (put! ch (-> res
                                  js/JSON.parse
                                  (util/faster-js->clj :keywordize-keys true))))})
    ch))

(defn debug []
  (go
    (let [v0-json (<! (fetch-json v0-url))
          v0-frames (vec (drop 1 (map #(p/acc->frame (last %)) (p/build-v0-frames v0-json))))
          v1-json (<! (fetch-json v1-url))
          v1-stdout (vec (map last (:stdout v1-json)))]
      (loop [n 0
             prev-vt (vt/make-vt (:width v1-json) (:height v1-json))]
        (if-let [str (get v1-stdout n)]
          (let [vt (vt/feed-str prev-vt str)
                prev-lines (vt/compact-lines (:lines prev-vt))
                prev-cursor (:cursor prev-vt)
                actual-lines (vt/compact-lines (:lines vt))
                actual-cursor (:cursor vt)
                expected-lines (get-in v0-frames [n :lines])
                expected-cursor (get-in v0-frames [n :cursor])]
            (print n)
            (print "fed: " str)
            (when (> n 0)
              (when (not= actual-lines expected-lines)
                (print "expected lines:")
                (prn expected-lines)
                (print "got lines:")
                (prn actual-lines)
                (print "prev lines:")
                (prn prev-lines)
                (throw "expectation failed"))

              (when (not= actual-cursor expected-cursor)
                (print "expected cursor:")
                (prn expected-cursor)
                (print "got cursor:")
                (prn actual-cursor)
                (print "prev cursor:")
                (prn prev-cursor)
                (throw "expectation failed")))

            (recur (inc n) vt))
          (print "success"))))))

(defn start-debug []
  (reset! reload-fn debug)
  (debug))
