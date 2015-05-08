(ns asciinema-player.core
  (:require [reagent.core :as reagent :refer [atom]]))

(defonce p1 (atom {
                   :id 10386,
                   :duration 148.297910690308,
                   :stdout_frames_url "https://asciinema-bb-eu.s3-eu-west-1.amazonaws.com/uploads/asciicast/stdout_frames/10386/stdout.json?AWSAccessKeyId=AKIAI2DOCAQ34YNJM3GA&Signature=ClbX4yZtzxWnK0qkzy4iKjqZv7w%3D&Expires=1431091060",
                   :snapshot [[["File Edit Options Buffers Tools C++ YASnippet Help                              " {"inverse" true}]] [["/" {"fg" 1, "inverse" true}] ["* Copyright (c) 2014 Vinícius dos San" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["/* Copyright (c) 2014 Vinícius dos Sant" {"fg" 1}] ["$" {}]] [["                                       " {"fg" 1}] ["|" {"inverse" true}] ["                                        " {"fg" 1}]] [["   Distributed under the Boost Softwar" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   Distributed under the Boost Software" {"fg" 1}] ["$" {}]] [["   file LICENSE_1_0.txt or copy at htt" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   file LICENSE_1_0.txt or copy at http" {"fg" 1}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOC$" {}] ["|" {"inverse" true}] ["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOCK$" {}]] [["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOC" {"fg" 3}] ["$" {}] ["|" {"inverse" true}] ["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOCK" {"fg" 3}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                     " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                      " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                   " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                    " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["       " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["        " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hp" {"fg" 2}] ["$" {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hpp" {"fg" 2}] ["$" {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["       " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["     " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["// TODO: remove me                     " {"fg" 1}] ["|" {"inverse" true}] ["// TODO: remove me                      " {"fg" 1}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                     " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                       " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] ["|-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] [" " {"inverse" true}]] [["                                                                                " {}]]],
                   :width 80,
                   :height 24
                  }))

(defonce app-state (atom {
                          :lines [
                                  [["OHAI" {:fg 1}]]
                                  [["hello " {:fg 2}] ["world!" {:fg 3}]]
                                  [["one" {:fg 4 :bg 1}] ["two" {:fg 5 :bg 2}] ["three" {:fg 6 :bg 3}]]
                                  []
                                  [["bye " {:fg 1}] ["bye!" {:bg 2}]]
                                ]
                          }))

(defn part-class-name [attrs]
  ; (let [{:keys [fg bg]} attrs]
  (str "fg-" (get attrs "fg") " bg-" (get attrs "bg")))

(defn part [p]
  [:span {:class-name (part-class-name (last p))} (first p)])

(defn line [parts]
  [:span.line (map (fn [p] [part p]) parts)])
  ;[:span.line (map (fn [p] ^{:key p} [part p]) parts)])

(defn click! [e]
  (swap! app-state update-in [:clicks] inc))

(defn terminal [lines]
  [:pre.asciinema-terminal.font-small
   (map (fn [l] [line l]) lines)])

(defn control-bar []
  [:div.controlbar (str "xbar ")])

(defn player-class-name [] "asciinema-theme-solarized-dark")

(defn player-style [] {})

(defn player [app]
  [:div.asciinema-player-wrapper {:tab-index -1}
   [:div.asciinema-player {:class-name (player-class-name) :style (player-style)}
    [terminal (:snapshot @app)]
    [control-bar]
    ; [overlay]
    ]])

(defn qqq [x]
  (prn (js->clj x)))

(defn main []
  (reagent/render-component [player p1] (. js/document (getElementById "app"))))
