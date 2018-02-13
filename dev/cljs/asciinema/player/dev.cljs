(ns asciinema.player.dev
  (:refer-clojure :exclude [compare])
  (:require [asciinema.player.core :as p]
            [asciinema.vt :as vt]
            [asciinema.vt.parser :as parser]
            [asciinema.player.util :as util]
            [asciinema.player.source :as source]
            [asciinema.player.view :as view]
            [asciinema.player.screen :as screen]
            [asciinema.player.asciicast.v0 :as v0]
            [asciinema.player.asciicast.v1 :as v1]
            [clojure.walk :as walk]
            [cljs.core.async :refer [chan >! <! put!]]
            [goog.net.XhrIo :as xhr]
            [clojure.string :as str])
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
                  ;; :poster poster-base64-data-uri
                  ;; :poster poster-json
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
  (let [dom-node (. js/document (getElementById "player"))]
    (p/mount-player-with-ratom player-state dom-node)))

;; (reload)

(defn fetch-json [url]
  (let [ch (chan)]
    (xhr/send url (fn [event]
                    (put! ch (-> event
                                 .-target
                                 .getResponseText
                                 js/JSON.parse
                                 (js->clj :keywordize-keys true)))))
    ch))

(defn start-dev []
  (reload))

(defn create-player-with-recording []
  (go
    (let [dom-node (. js/document (getElementById "player"))
          asciicast (<! (fetch-json "/asciicasts/21195.json"))]
      (p/create-player dom-node asciicast {}))))

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
          v0-frames (vec (drop 1 (map #(screen/lines (last %)) (v0/build-frames v0-json nil)))) ; FIXME
          v1-json (<! (fetch-json v1-url))
          v1-stdout (vec (map last (:stdout v1-json)))]
      (print "comparing...")
      (loop [n 0
             prev-vt (vt/make-vt (:width v1-json) (:height v1-json))]
        (when (zero? (mod n 100))
          (print n "/" (count v1-stdout)))
        (if-let [str (get v1-stdout n)]
          (let [vt (vt/feed-str prev-vt str)
                prev-lines (-> prev-vt :screen screen/lines)
                prev-cursor (-> prev-vt :screen screen/cursor)
                actual-lines (-> vt :screen screen/lines)
                actual-cursor (-> vt :screen screen/cursor)
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

(comment

  (go
    (let [asciicast-filename "20055.json"
          v1-url (str "/asciicasts/" asciicast-filename)]
      (def v1-json (<! (fetch-json v1-url)))))

  ;; benchmark v1-frames

  (go
    (let [v1-frames (v1/build-frames v1-json)]
      (time (last v1-frames))))

  ;; benchmark vt/feed

  (go
    (let [strings (map second (get v1-json :stdout))
          frames (map (fn [string] (mapv #(.codePointAt string %) (range (count string)))) strings)]
      (dotimes [_ 4]
        (time
         (loop [vt (vt/make-vt 80 24)
                frames frames]
           (if-let [inputs (first frames)]
             (recur (vt/feed vt inputs) (rest frames))
             vt))))
      (println "done.")))

  ;; benchmark vt/parse

  (go
    (let [data (str/join (map second (get v1-json :stdout)))
          codes (mapv #(.codePointAt data %) (range (count data)))]
      (time
       (loop [state :ground
              codes codes]
         (if-let [input (first codes)]
           (let [[new-state _] (parser/parse state input)]
             (recur new-state (rest codes)))
           state)))))

)

;; (let [v1-frames (p/build-v1-frames v1-json)]
;;   (-> v1-frames (nth 45) last p/vt->frame :lines vec (nth 13) ffirst))

;; (-> v1-json :stdout (nth 45))

;; (-> v1-frames (nth 45) last p/vt->frame :lines (nth 13)))

;; (-> (p/vt->frame (last (nth v1-frames 45))) :lines vec (nth 14)))
