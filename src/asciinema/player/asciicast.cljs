(ns asciinema.player.asciicast
  (:refer-clojure :exclude [js->clj])
  (:require [asciinema.player.asciicast.v0 :as v0]
            [asciinema.player.asciicast.v1 :as v1]
            [asciinema.player.asciicast.v2 :as v2]
            [asciinema.player.patch :refer [js->clj]]
            [asciinema.player.screen :as ps]
            [asciinema.vt :as vt]
            [asciinema.vt.screen :as screen]
            [clojure.string :as str]))

(def format-error "only asciicast v1 and v2 formats can be opened")

(defn parse-json [json]
  (-> json js/JSON.parse (js->clj :keywordize-keys true)))

(defn parse-jsonl [jsonl]
  (let [lines (-> jsonl str/trim (str/split "\n"))]
    (map parse-json lines)))

(defn load-from-map [thing vt-width vt-height]
  (when (= (:version thing) 1)
    (v1/initialize-asciicast thing vt-width vt-height)))

(defn load-from-seq [thing vt-width vt-height]
  (let [header (first thing)]
    (cond
      (= (:version header) 2) (v2/initialize-asciicast thing vt-width vt-height)
      (-> header second :lines) (v0/initialize-asciicast thing)
      :else nil)))

(defn load-from-string [thing vt-width vt-height]
  (try
    (let [thing (parse-json thing)]
      (cond
        (sequential? thing) (load-from-seq thing vt-width vt-height)
        (map? thing) (load-from-map thing vt-width vt-height)))
    (catch :default e
      (try
        (-> thing parse-jsonl (load-from-seq vt-width vt-height))
        (catch :default e
          nil)))))

(defn load
  ([thing] (load thing nil nil))
  ([thing vt-width vt-height]
   (or (cond
         (string? thing) (load-from-string thing vt-width vt-height)
         (sequential? thing) (load-from-seq thing vt-width vt-height)
         (map? thing) (load-from-map thing vt-width vt-height)
         :else nil)
       (throw format-error))))

(defn- vt-lines [vt]
  (-> vt :screen screen/lines))

(defn- vt-cursor [vt]
  (-> vt :screen screen/cursor))

(extend-protocol ps/Screen
  vt/VT
  (lines [this]
    (vt-lines this))
  (cursor [this]
    (vt-cursor this)))
