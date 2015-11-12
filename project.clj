(defproject player "0.1.0-SNAPSHOT"
  :description "asciinema player"
  :url "http://example.com/FIXME"
  :license {:name "GNU GPL v3"
            :url "http://www.gnu.org/licenses/gpl-3.0.txt"}

  :dependencies [[org.clojure/clojure "1.7.0"]
                 [org.clojure/clojurescript "1.7.122"]
                 [org.clojure/core.async "0.1.346.0-17112a-alpha"]
                 [cljsjs/react "0.13.1-0"]
                 [reagent "0.5.0"]
                 [devcards "0.2.0-3"]
                 [org.clojure/test.check "0.8.2"]
                 [cljs-ajax "0.3.11"]]

  :plugins [[lein-cljsbuild "1.0.6"]
            [lein-figwheel "0.4.1"]
            [lein-less "1.7.5"]
            [lein-kibit "0.1.2"]]

  :min-lein-version "2.4.0"

  :hooks [leiningen.cljsbuild]

  :clean-targets ^{:protect false} ["resources/public/js" "target"]

  :cljsbuild {:builds {:dev {:source-paths ["src/cljs" "env/dev/cljs"]
                             :figwheel {:on-jsload "asciinema-player.main/reload"}
                             :compiler {:main "asciinema-player.main"
                                        :asset-path "js/dev"
                                        :output-to "resources/public/js/dev.js"
                                        :output-dir "resources/public/js/dev"
                                        :source-map true
                                        :optimizations :none
                                        :pretty-print true}}
                       :devcards {:source-paths ["src/cljs" "src/cards" ]
                                  :figwheel {:devcards true}
                                  :compiler {:main "asciinema-player.cards"
                                             :asset-path "js/devcards"
                                             :output-to "resources/public/js/devcards.js"
                                             :output-dir "resources/public/js/devcards"
                                             :source-map-timestamp true
                                             :optimizations :none}}
                       :test {:source-paths ["src/cljs" "test"]
                              :notify-command ["phantomjs" "env/test/js/unit-test.js" "env/test/unit-test.html"]
                              :compiler {:output-to     "resources/public/js/test.js"
                                         :output-dir    "resources/public/js/test"
                                         :source-map    "resources/public/js/test.js.map"
                                         :optimizations :none
                                         :pretty-print  false}}
                       :release {:source-paths ["src/cljs"]
                              :compiler {:output-to     "resources/public/js/release.js"
                                         :output-dir    "resources/public/js/release"
                                         :preamble      ["license.js"]
                                         :optimizations :advanced
                                         :pretty-print  false}}}
              :test-commands {"test" ["phantomjs" "env/test/js/unit-test.js" "env/test/unit-test.html"]}}

  :figwheel {:http-server-root "public"
             :server-port 3449
             :nrepl-port 7888
             :css-dirs ["resources/public/css"]}

  :less {:source-paths ["src/less"]
         :target-path "resources/public/css"})
