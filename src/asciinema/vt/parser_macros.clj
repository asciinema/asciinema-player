(ns asciinema.vt.parser-macros
  (:require [clojure.string :as str]))

(defn event-seq [event]
  (if (keyword? event)
    (let [[low high] (str/split (name event) #"-")
          low (Long/decode low)
          high (Long/decode high)]
      (range low (inc high)))
    [event]))

(defmacro events [& items]
  `(set '~(mapcat event-seq items)))

(def c0-prime? (events :0x00-0x17 0x19 :0x1C-0x1F))

(def anywhere-state
  {(events 0x18 0x1A :0x80-0x8F :0x91-0x97 0x99 0x9A) {:action :execute, :transition :ground}
   (events 0x9C) {:transition :ground}
   (events 0x1B) {:transition :escape}
   (events 0x98 0x9E 0x9F) {:transition :sos-pm-apc-string}
   (events 0x90) {:transition :dcs-entry}
   (events 0x9D) {:transition :osc-string}
   (events 0x9B) {:transition :csi-entry}})

(def states
  {:ground
   {c0-prime? {:action :execute}
    (events :0x20-0x7F :0xA0-0xFF) {:action :print}}

   :escape
   {:on-enter :clear
    c0-prime? {:action :execute}
    (events :0x20-0x2F) {:action :collect, :transition :escape-intermediate}
    (events :0x30-0x4F :0x51-0x57 0x59 0x5A 0x5C :0x60-0x7E) {:action :esc-dispatch, :transition :ground}
    (events 0x5B) {:transition :csi-entry}
    (events 0x5D) {:transition :osc-string}
    (events 0x50) {:transition :dcs-entry}
    (events 0x58 0x5E 0x5F) {:transition :sos-pm-apc-string}
    (events 0x7f) {:action :ignore}}

   :escape-intermediate
   {c0-prime? {:action :execute}
    (events :0x20-0x2F) {:action :collect}
    (events :0x30-0x7E) {:action :esc-dispatch, :transition :ground}
    (events 0x7f) {:action :ignore}}

   :csi-entry
   {:on-enter :clear
    c0-prime? {:action :execute}
    (events :0x40-0x7E) {:action :csi-dispatch, :transition :ground}
    (events :0x30-0x39 0x3B) {:action :param, :transition :csi-param}
    (events :0x3C-0x3F) {:action :collect, :transition :csi-param}
    (events 0x3A) {:transition :csi-ignore}
    (events :0x20-0x2F) {:action :collect, :transition :csi-intermediate}
    (events 0x7f) {:action :ignore}}

   :csi-param
   {c0-prime? {:action :execute}
    (events :0x30-0x39 0x3B) {:action :param}
    (events 0x3A :0x3C-0x3F) {:transition :csi-ignore}
    (events :0x20-0x2F) {:action :collect, :transition :csi-intermediate}
    (events :0x40-0x7E) {:action :csi-dispatch, :transition :ground}
    (events 0x7f) {:action :ignore}}

   :csi-intermediate
   {c0-prime? {:action :execute}
    (events :0x20-0x2F) {:action :collect}
    (events :0x40-0x7E) {:action :csi-dispatch, :transition :ground}
    (events :0x30-0x3F) {:transition :csi-ignore}
    (events 0x7f) {:action :ignore}}

   :csi-ignore
   {c0-prime? {:action :execute}
    (events :0x20-0x3F) {:action :ignore}
    (events :0x40-0x7E) {:transition :ground}
    (events 0x7f) {:action :ignore}}

   :dcs-entry
   {:on-enter :clear
    c0-prime? {:action :ignore}
    (events :0x20-0x2F) {:action :collect, :transition :dcs-intermediate}
    (events 0x3A) {:transition :dcs-ignore}
    (events :0x30-0x39 0x3B) {:action :param, :transition :dcs-param}
    (events :0x3C-0x3F) {:action :collect, :transition :dcs-param}
    (events :0x40-0x7E) {:transition :dcs-passthrough}
    (events 0x7f) {:action :ignore}}

   :dcs-param
   {c0-prime? {:action :ignore}
    (events :0x20-0x2F) {:action :collect, :transition :dcs-intermediate}
    (events :0x30-0x39 0x3B) {:action :param}
    (events 0x3A :0x3C-0x3F) {:transition :dcs-ignore}
    (events :0x40-0x7E) {:transition :dcs-passthrough}
    (events 0x7f) {:action :ignore}}

   :dcs-intermediate
   {c0-prime? {:action :ignore}
    (events :0x20-0x2F) {:action :collect}
    (events :0x30-0x3F) {:transition :dcs-ignore}
    (events :0x40-0x7E) {:transition :dcs-passthrough}
    (events 0x7f) {:action :ignore}}

   :dcs-passthrough
   {:on-enter :hook
    c0-prime? {:action :put}
    (events :0x20-0x7E) {:action :put}
    (events 0x7f) {:action :ignore}
    :on-exit :unhook}

   :dcs-ignore
   {c0-prime? {:action :ignore}
    (events :0x20-0x7f) {:action :ignore}}

   :osc-string
   {:on-enter :osc-start
    (disj c0-prime? 0x07) {:action :ignore}
    (events :0x20-0x7F) {:action :osc-put}
    (events 0x07) {:transition :ground} ; 0x07 is xterm non-ANSI variant of transition to :ground
    :on-exit :osc-end}

   :sos-pm-apc-string
   {c0-prime? {:action :ignore}
    (events :0x20-0x7F) {:action :ignore}}})

(defn- get-transition [rules input]
  (some (fn [[pred cfg]] (when (pred input) cfg)) rules))

(defn parse* [current-state input]
  (let [current-state-cfg (get states current-state)
        transition (or (get-transition anywhere-state input)
                       (get-transition current-state-cfg (if (>= input 0xa0) 0x41 input)))
        transition-action (:action transition)]
    (if-let [new-state (:transition transition)]
      (let [new-state-cfg (get states new-state)
            exit-action (:on-exit current-state-cfg)
            entry-action (:on-enter new-state-cfg)
            actions (vec (remove nil? [exit-action transition-action entry-action]))]
        [new-state actions])
      [current-state (if transition-action [transition-action] [])])))

(defmacro build-lookup-table []
  (apply merge (for [state (keys states)]
                 {state (mapv (partial parse* state) (range 0xa0))})))
