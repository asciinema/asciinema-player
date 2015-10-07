(ns asciinema-player.main
  (:require [asciinema-player.core :as p]
            [clojure.walk :as walk]))

(defonce snapshot-js [[["File Edit Options Buffers Tools C++ YASnippet Help                              " {"inverse" true}]] [["/" {"fg" 1, "inverse" true}] ["* Copyright (c) 2014 Vinícius dos San" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["/* Copyright (c) 2014 Vinícius dos Sant" {"fg" 1}] ["$" {}]] [["                                       " {"fg" 1}] ["|" {"inverse" true}] ["                                        " {"fg" 1}]] [["   Distributed under the Boost Softwar" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   Distributed under the Boost Software" {"fg" 1}] ["$" {}]] [["   file LICENSE_1_0.txt or copy at htt" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   file LICENSE_1_0.txt or copy at http" {"fg" 1}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOC$" {}] ["|" {"inverse" true}] ["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOCK$" {}]] [["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOC" {"fg" 3}] ["$" {}] ["|" {"inverse" true}] ["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOCK" {"fg" 3}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                     " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                      " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                   " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                    " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["       " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["        " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hp" {"fg" 2}] ["$" {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hpp" {"fg" 2}] ["$" {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["       " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["     " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["// TODO: remove me                     " {"fg" 1}] ["|" {"inverse" true}] ["// TODO: remove me                      " {"fg" 1}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                     " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                       " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] ["|-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] [" " {"inverse" true}]] [["                                                                                " {}]]])

(defonce snapshot (walk/keywordize-keys snapshot-js))
(defonce options {:title "\"Something cool\" by sickill"
                  :author-img-url "https://gravatar.com/avatar/2807e23da22a140cf573ea75b37d11f6?s=128&d=retro"})

;; "emacs"

(defonce player-state
  (p/make-player-state 80 24 "/frames-10386.json" 148.297910690308 (merge options {:snapshot snapshot})))

;; (add-watch player-state :foo (fn [_ id old new] (prn (-> new (dissoc :lines) (dissoc :snapshot) (dissoc :frames)))))

;; "fractals"

;; (defonce player-state
;;   (p/make-player-state 80 24 "/frames-20055.json" 38.91 options))

;; "catimg"

;; (defonce player-state
;;   (p/make-player-state 100 41 "/frames-26491.json" 12.318521 options))

;; "color table"

;; (defonce player-state
;;   (p/make-player-state 84 31 "/frames-color-test.json" 4.533024 options))

(defn reload []
  (p/create-player-with-state player-state (. js/document (getElementById "player"))))

(defn start-dev []
  (reload))

; (swap! player-state assoc :theme "solarized-dark")
; (swap! player-state assoc :theme "solarized-light")
; (swap! player-state assoc :theme "tango")
; (swap! player-state assoc :theme "seti")
; (swap! player-state assoc :current-time 45)
; (swap! player-state assoc :font-size "small")
; (swap! player-state assoc :speed 1)
