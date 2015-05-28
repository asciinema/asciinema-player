(defproject player "0.1.0-SNAPSHOT"
  :description "asciinema player"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}

  :dependencies [[org.clojure/clojure "1.7.0-beta1"]
                 [org.clojure/clojurescript "0.0-3297"]
                 [org.clojure/core.async "0.1.346.0-17112a-alpha"]
                 [cljsjs/react "0.13.1-0"]
                 [reagent "0.5.0"]]

  :plugins [[lein-cljsbuild "1.0.6"]
            [lein-figwheel "0.3.3"]
            [lein-less "1.7.5"]]

  :min-lein-version "2.4.0"

  :hooks [leiningen.cljsbuild]

  :cljsbuild {:builds {:dev {:source-paths ["src/cljs" "env/dev/cljs"]
                             :figwheel {:on-jsload "asciinema-player.main/reload"}
                             :compiler {:output-to     "resources/public/js/dev.js"
                                        :output-dir    "resources/public/js/dev"
                                        :source-map    true
                                        :optimizations :none
                                        :pretty-print  true}}
                       :test {:source-paths ["src/cljs" "test"]
                              :notify-command ["phantomjs" "env/test/js/unit-test.js" "env/test/unit-test.html"]
                              :compiler {:output-to     "resources/public/js/test.js"
                                         :output-dir    "resources/public/js/test"
                                         :source-map    "resources/public/js/test.js.map"
                                         :optimizations :whitespace
                                         :pretty-print  false}}}
              :test-commands {"test" ["phantomjs" "env/test/js/unit-test.js" "env/test/unit-test.html"]}}

  :figwheel {:http-server-root "public"
             :server-port 3449
             :css-dirs ["resources/public/css"]}

  :less {:source-paths ["src/less"]
         :target-path "resources/public/css"})
