(ns asciinema.player.test-macros
  (:require [environ.core :refer [env]]))

(defmacro property-tests-multiplier []
  (let [multiplier-str (get env :property-tests-multiplier "1")]
    (Integer/parseInt multiplier-str)))

(defmacro expect-lines [vt expected]
  `(~'is (= (-> ~vt :screen screen/lines) ~expected)))

(defmacro expect-first-line [vt expected]
  `(~'is (= (-> ~vt :screen screen/lines first) ~expected)))

(defmacro expect-cursor
  ([vt expected-x expected-y]
   `(let [{:keys [~'x ~'y]} (-> ~vt :screen screen/cursor)]
      (~'is (= ~'x ~expected-x))
      (~'is (= ~'y ~expected-y))))
  ([vt expected-x expected-y expected-visible]
   `(let [{:keys [~'x ~'y ~'visible]} (-> ~vt :screen screen/cursor)]
      (~'is (= ~'x ~expected-x))
      (~'is (= ~'y ~expected-y))
      (~'is (= ~'visible ~expected-visible)))))

(defmacro expect-tabs [vt tabs]
  `(~'is (= (-> ~vt :screen :tabs) ~tabs)))
