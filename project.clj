(defproject player "0.1.0-SNAPSHOT"
  :description "asciinema player"
  :url "https://github.com/asciinema/asciinema-player"
  :license {:name "Apache 2.0"
            :url "http://www.apache.org/licenses/LICENSE-2.0"}

  :dependencies [[org.clojure/clojure "1.8.0"]
                 [org.clojure/clojurescript "1.9.473"]
                 [org.clojure/core.async "0.2.374"]
                 [reagent "0.6.0"]
                 [devcards "0.2.2" :exclusions [cljsjs/react]]
                 [org.clojure/test.check "0.9.0"]
                 [org.clojure/core.match "0.3.0-alpha4"]
                 [prismatic/schema "1.1.3"]]

  :plugins [[lein-cljsbuild "1.1.5"]
            [lein-figwheel "0.5.9"]
            [lein-less "1.7.5"]
            [lein-doo "0.1.7"]
            [lein-kibit "0.1.3"]]

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
                                        :foreign-libs [{:file "public/element.js"
                                                        :provides ["asciinema.player.element"]}
                                                       {:file "public/codepoint-polyfill.js"
                                                        :provides ["asciinema.player.codepoint-polyfill"]}]
                                        :optimizations :none
                                        :pretty-print true}}
                       :devcards {:source-paths ["src" "dev/cards" ]
                                  :figwheel {:devcards true}
                                  :compiler {:main "asciinema.player.cards"
                                             :asset-path "js/devcards"
                                             :output-to "resources/public/js/devcards.js"
                                             :output-dir "resources/public/js/devcards"
                                             :source-map-timestamp true
                                             :foreign-libs [{:file "public/element.js"
                                                             :provides ["asciinema.player.element"]}]
                                             :optimizations :none}}
                       :test {:source-paths ["src" "test"]
                              :compiler {:output-to "resources/public/js/test.js"
                                         :source-map true
                                         :foreign-libs [{:file "public/element.js"
                                                         :provides ["asciinema.player.element"]}
                                                        {:file "public/codepoint-polyfill.js"
                                                         :provides ["asciinema.player.codepoint-polyfill"]}]
                                         :optimizations :none
                                         :pretty-print false
                                         :main "asciinema.player.runner"}}
                       :release {:source-paths ["src"]
                                 :compiler {:output-to "resources/public/js/asciinema-player.js"
                                            :output-dir "resources/public/js/release"
                                            :closure-defines {goog.DEBUG false}
                                            :preamble ["license.js" "public/CustomEvent.js" "public/CustomElements.min.js"]
                                            :foreign-libs [{:file "public/element.js"
                                                            :provides ["asciinema.player.element"]}
                                                           {:file "public/codepoint-polyfill.js"
                                                            :provides ["asciinema.player.codepoint-polyfill"]}]
                                            :optimizations :advanced
                                            :elide-asserts true
                                            :pretty-print  false}}}}

  :figwheel {:http-server-root "public"
             :server-port 3449
             :css-dirs ["resources/public/css"]}

  :less {:source-paths ["src/less"]
         :target-path "resources/public/css"})
