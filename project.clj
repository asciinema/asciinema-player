(defproject player "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}

  :dependencies [[org.clojure/clojure "1.6.0"]
                 [org.clojure/clojurescript "0.0-2511" :scope "provided"]
                 [org.clojure/core.async "0.1.346.0-17112a-alpha"]
                 [cljsjs/react "0.13.1-0"]
                 [reagent "0.5.0"]
                 [figwheel "0.2.1-SNAPSHOT"]
                 [figwheel-sidecar "0.2.1-SNAPSHOT"]]

  :plugins [[lein-cljsbuild "1.0.5"]
            [lein-figwheel "0.2.1-SNAPSHOT"]
            [lein-less "1.7.2"]]

  :min-lein-version "2.5.0"

  :cljsbuild {:builds {:dev {:source-paths ["src/cljs" "env/dev/cljs"]
                             :figwheel true
                             :compiler {:output-to     "resources/public/js/app.js"
                                        :output-dir    "resources/public/js/out"
                                        :source-map    "resources/public/js/out.js.map"
                                        :preamble      ["react/react.min.js"]
                                        :optimizations :none
                                        :pretty-print  true}}
                       :test {:source-paths ["src/cljs" "test/cljs"]
                              :notify-command ["phantomjs" "env/test/js/unit-test.js" "env/test/unit-test.html"]
                              :compiler {:output-to     "resources/public/js/app_test.js"
                                         :output-dir    "resources/public/js/test"
                                         :source-map    "resources/public/js/test.js.map"
                                         :preamble      ["react/react.min.js"]
                                         :optimizations :whitespace
                                         :pretty-print  false}}}
              :test-commands {"test" ["phantomjs" "env/test/js/unit-test.js" "env/test/unit-test.html"]}}

  :figwheel {:http-server-root "public"
             :server-port 3449
             :css-dirs ["resources/public/css"]}

  :less {:source-paths ["src/less/main"]
         :target-path "resources/public/css"})
