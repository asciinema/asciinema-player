(ns asciinema.player.dev
  (:refer-clojure :exclude [compare])
  (:require [asciinema.player.core :as p]
            [asciinema.player.vt :as vt]
            [asciinema.player.util :as util]
            [asciinema.player.source :as source]
            [clojure.walk :as walk]
            [cljs.core.async :refer [chan >! <! put!]]
            [ajax.core :refer [GET]])
  (:require-macros [cljs.core.async.macros :refer [go]]))

(defonce poster-js [[["File Edit Options Buffers Tools C++ YASnippet Help                              " {"inverse" true}]] [["/" {"fg" 1, "inverse" true}] ["* Copyright (c) 2014 Vinícius dos San" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["/* Copyright (c) 2014 Vinícius dos Sant" {"fg" 1}] ["$" {}]] [["                                       " {"fg" 1}] ["|" {"inverse" true}] ["                                        " {"fg" 1}]] [["   Distributed under the Boost Softwar" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   Distributed under the Boost Software" {"fg" 1}] ["$" {}]] [["   file LICENSE_1_0.txt or copy at htt" {"fg" 1}] ["$" {}] ["|" {"inverse" true}] ["   file LICENSE_1_0.txt or copy at http" {"fg" 1}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOC$" {}] ["|" {"inverse" true}] ["#ifndef" {"fg" 4, "bold" true}] [" BOOST_HTTP_EMBEDDED_SERVER_SOCK$" {}]] [["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOC" {"fg" 3}] ["$" {}] ["|" {"inverse" true}] ["#define" {"fg" 4, "bold" true}] [" " {}] ["BOOST_HTTP_EMBEDDED_SERVER_SOCK" {"fg" 3}] ["$" {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                     " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<cstdint>" {"fg" 2}] ["                      " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                   " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<algorithm>" {"fg" 2}] ["                    " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["       " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/asio/ip/tcp.hpp>" {"fg" 2}] ["        " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hp" {"fg" 2}] ["$" {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/outgoing_state.hpp" {"fg" 2}] ["$" {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/message.hpp>" {"fg" 2}] ["       " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<boost/http/http_errc.hpp>" {"fg" 2}] ["     " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["// TODO: remove me                     " {"fg" 1}] ["|" {"inverse" true}] ["// TODO: remove me                      " {"fg" 1}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                    " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<iostream>" {"fg" 2}] ["                     " {}]] [["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                      " {}] ["|" {"inverse" true}] ["#include" {"fg" 4, "bold" true}] [" " {}] ["<string>" {"fg" 2}] ["                       " {}]] [["                                       " {}] ["|" {"inverse" true}] ["                                        " {}]] [["-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] ["|-UUU:----F1  " {"inverse" true}] ["embedded_server_socket.hpp" {"bold" true, "inverse" true}] [" " {"inverse" true}]] [["                                                                                " {}]]])

(defonce poster-json (walk/keywordize-keys poster-js))

(defonce poster-base64-data-uri
  (str "data:application/json;base64," (-> poster-js clj->js js/JSON.stringify js/btoa)))

(defonce options {:speed 1
                  :auto-play false
                  :preload false
                  :loop true
                  :poster "data:text/plain,\n\r  test \u001b[1;32msnapshot"
                  :title "Something cool"
                  :author "sickill"
                  :author-url "http://ku1ik.com/"
                  :author-img-url "https://gravatar.com/avatar/2807e23da22a140cf573ea75b37d11f6?s=128&d=retro"})

;; old, preprocessed, pre-v1 format

;; (defonce player-state (p/make-player-ratom "/asciicasts/frames-10386.json" (merge options {:poster poster-base64-data-uri})))

;; v1 format

(defonce player-state (p/make-player-ratom "/asciicasts/21195.json" options))
;; (defonce player-state (p/make-player-ratom "/asciicasts/20055.json" options))
;; (defonce player-state (p/make-player-ratom "/asciicasts/frames-20055.json" options))

;; v2 format (stream)

;; (defonce player-state (p/make-player-ratom "/asciicasts/live.json" options))

;; (swap! player-state assoc :theme "solarized-dark")
;; (swap! player-state assoc :font-size "small")
;; (swap! player-state assoc :font-size "15px")
;; (swap! player-state assoc :speed 1)

(defn reload []
  (source/init (:source @player-state))
  (p/mount-player-with-ratom player-state (. js/document (getElementById "player"))))

;; (reload)

(defn start-dev []
  (reload))

(defn fetch-json [url]
  (let [ch (chan)]
    (GET url
         {:response-format :raw
          :handler (fn [res]
                     (put! ch (-> res
                                  js/JSON.parse
                                  (js->clj :keywordize-keys true))))})
    ch))

(defn feed-verbose [vt str]
  (let [codes (map #(.charCodeAt % 0) str)]
    (reduce (fn [vt input]
              (prn (-> vt :parser :state))
              (vt/feed-one vt input)) vt codes)))

(defn compare [asciicast-filename check-from]
  (go
    (let [v0-url (str "/asciicasts/frames-" asciicast-filename)
          v1-url (str "/asciicasts/" asciicast-filename)
          v0-json (<! (fetch-json v0-url))
          v0-frames (vec (drop 1 (map #(source/acc->screen (last %)) (source/build-v0-frames v0-json))))
          v1-json (<! (fetch-json v1-url))
          v1-stdout (vec (map last (:stdout v1-json)))]
      (print "comparing...")
      (loop [n 0
             prev-vt (vt/make-vt (:width v1-json) (:height v1-json))]
        (when (= (mod n 100) 0)
          (print n "/" (count v1-stdout)))
        (if-let [str (get v1-stdout n)]
          (let [vt (vt/feed-str prev-vt str)
                prev-lines (vt/compact-lines (:lines prev-vt))
                prev-cursor (:cursor prev-vt)
                actual-lines (vt/compact-lines (:lines vt))
                actual-cursor (:cursor vt)
                expected-lines (get-in v0-frames [n :lines])
                expected-cursor (get-in v0-frames [n :cursor])]
            (when (>= n check-from)
              (when (not= actual-cursor expected-cursor)
                (print n)
                (print "fed: " str)

                (print "expected cursor:")
                (prn expected-cursor)
                (print "got cursor:")
                (prn actual-cursor)
                (print "prev cursor:")
                (prn prev-cursor)
                (throw "expectation failed"))

              (when (not= actual-lines expected-lines)
                (print n)
                (print "fed: " str)

                (print "prev lines:")
                (prn prev-lines)
                (print "expected lines:")
                (prn expected-lines)
                (print "got lines:")
                (prn actual-lines)
                (print "first non-matching line:")
                (let [conflict (first (filter #(apply not= %) (map vector expected-lines actual-lines)))]
                  (prn "expected: " (first conflict))
                  (prn "got: " (second conflict)))
                ;; (feed-verbose prev-vt str)
                (throw "expectation failed")))

            (recur (inc n) vt))
          (print "success"))))))

;; (compare "21195.json" 1)

;; (go
;;   (let [asciicast-filename "20055.json"
;;         v1-url (str "/asciicasts/" asciicast-filename)]
;;     (def v1-json (<! (fetch-json v1-url)))))

;; (go
;;   (let [v1-frames (p/build-v1-frames v1-json)]
;;     (time (last v1-frames))))

;; (let [v1-frames (p/build-v1-frames v1-json)]
;;   (-> v1-frames (nth 45) last p/vt->frame :lines vec (nth 13) ffirst))

;; (-> v1-json :stdout (nth 45))

;; (-> v1-frames (nth 45) last p/vt->frame :lines (nth 13)))

;; (-> (p/vt->frame (last (nth v1-frames 45))) :lines vec (nth 14)))
