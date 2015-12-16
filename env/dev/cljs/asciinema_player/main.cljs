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
  (p/make-player-ratom 80 24 "/asciicasts/frames-10386.json" (merge options {:snapshot snapshot})))

;; (add-watch player-state :foo (fn [_ id old new] (prn (-> new (dissoc :lines) (dissoc :snapshot) (dissoc :frames)))))

;; "fractals"

;; (defonce player-state
;;   (p/make-player-ratom 80 24 "/asciicasts/frames-20055.json" options))

;; (defonce player-state
;;   (p/make-player-ratom 80 24 "/asciicasts/20055.json" options))

;; "limelight.vim"

;; (defonce player-state
;;   (p/make-player-ratom 79 22 "/asciicasts/21195.json" options))

;; (defonce player-state
;;   (p/make-player-ratom 79 22 "/asciicasts/frames-21195.json" options))

;; "catimg"

;; (defonce player-state
;;   (p/make-player-ratom 100 41 "/asciicasts/frames-26491.json" options))

;; "color table"

;; (defonce player-state
;;   (p/make-player-ratom 84 31 "/asciicasts/frames-color-test.json" options))

;; (swap! player-state assoc :theme "solarized-dark")
;; (swap! player-state assoc :theme "solarized-light")
;; (swap! player-state assoc :theme "tango")
;; (swap! player-state assoc :theme "seti")
;; (swap! player-state assoc :current-time 45)
;; (swap! player-state assoc :font-size "small")
;; (swap! player-state assoc :speed 1)

(defonce reload-fn (atom (fn [])))

(defn reload []
  (@reload-fn))

(defn reload-player []
  (p/create-player-with-state player-state (. js/document (getElementById "player"))))

(defn start-dev []
  (reset! reload-fn reload-player)
  (reload-player))

(def asciicast-filename "22994.json")
(def v0-url (str "/asciicasts/frames-" asciicast-filename))
(def v1-url (str "/asciicasts/" asciicast-filename))
(def check-from 1)

(defn fetch-json [url]
  (let [ch (chan)]
    (GET url
         {:response-format :raw
          :handler (fn [res]
                     (put! ch (-> res
                                  js/JSON.parse
                                  (util/faster-js->clj :keywordize-keys true))))})
    ch))

(defn feed-verbose [vt str]
  (let [codes (map #(.charCodeAt % 0) str)]
    (reduce (fn [vt input]
              (prn (-> vt :parser :state))
              (vt/feed-one vt input)) vt codes)))

(defn debug []
  (go
    (let [v0-json (<! (fetch-json v0-url))
          v0-frames (vec (drop 1 (map #(p/acc->frame (last %)) (p/build-v0-frames v0-json))))
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

(defn start-debug []
  ;; (reset! reload-fn debug)
  (debug))
