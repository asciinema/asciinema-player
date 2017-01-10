#!/bin/bash

# usage:
# .gen-png.sh path/or/url/to/asciicast.json path/to/output.png seconds-in

phantomjs \
  --debug=true \
  --web-security=false \
  --local-to-remote-url-access=true \
  gen-png.js \
  $1 \
  $2 \
  png \
  npt:$3 \
  '#player' \
  2
