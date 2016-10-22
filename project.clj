(defproject player "0.1.0-SNAPSHOT"
  :description "asciinema player"
  :url "http://example.com/FIXME"
  :license {:name "GNU GPL v3"
            :url "http://www.gnu.org/licenses/gpl-3.0.txt"}

  :dependencies [[org.clojure/clojure "1.8.0"]
                 [org.clojure/clojurescript "1.9.293"]
                 [org.clojure/core.async "0.2.374"]
                 [reagent "0.5.1"]
                 [devcards "0.2.0-3"]
                 [org.clojure/test.check "0.8.2"]
                 [org.clojure/core.match "0.3.0-alpha4"]
                 [prismatic/schema "1.1.3"]
                 [cljs-ajax "0.5.8"]]

  :plugins [[lein-cljsbuild "1.1.2"]
            [lein-figwheel "0.5.0-2"]
            [lein-less "1.7.5"]
            [lein-doo "0.1.6"]
            [lein-kibit "0.1.2"]]

  :min-lein-version "2.5.3"

  :clean-targets ^{:protect false} ["resources/public/js" "target"]

  :source-paths ["src"]

  :profiles {:dev {:dependencies [[com.cemerick/piggieback "0.2.1"]
                                  [org.clojure/tools.nrepl "0.2.10"]
                                  [environ "1.0.1"]
                                  [figwheel-sidecar "0.5.0-1"]]
                   :plugins [[refactor-nrepl "1.1.0"]]
                   :source-paths ["dev/clj" "dev/cljs"]}
             :repl {:plugins [[cider/cider-nrepl "0.10.0"]]}}

  :repl-options {:nrepl-middleware [cemerick.piggieback/wrap-cljs-repl]}

  :cljsbuild {:builds {:dev {:source-paths ["src" "dev/cljs"]
                             :figwheel {:on-jsload "asciinema.player.dev/reload"}
                             :compiler {:main "asciinema.player.dev"
                                        :asset-path "js/dev"
                                        :output-to "resources/public/js/dev.js"
                                        :output-dir "resources/public/js/dev"
                                        :source-map true
                                        :optimizations :none
                                        :pretty-print true}}
                       :devcards {:source-paths ["src" "dev/cards" ]
                                  :figwheel {:devcards true}
                                  :compiler {:main "asciinema.player.cards"
                                             :asset-path "js/devcards"
                                             :output-to "resources/public/js/devcards.js"
                                             :output-dir "resources/public/js/devcards"
                                             :source-map-timestamp true
                                             :optimizations :none}}
                       :test {:source-paths ["src" "test"]
                              :compiler {:output-to "resources/public/js/test.js"
                                         :source-map true
                                         :optimizations :none
                                         :pretty-print false
                                         :main "asciinema.player.runner"}}
                       :release {:source-paths ["src"]
                                 :compiler {:output-to "resources/public/js/release.js"
                                            :output-dir "resources/public/js/release"
                                            :preamble ["license.js" "public/CustomEvent.js" "public/CustomElements.min.js" "public/element.js"]
                                            :optimizations :advanced
                                            :elide-asserts true
                                            :pretty-print  false}}}}

  :figwheel {:http-server-root "public"
             :server-port 3449
             :css-dirs ["resources/public/css"]}

  :less {:source-paths ["src/less"]
         :target-path "resources/public/css"})
