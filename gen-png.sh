#!/bin/bash

# usage:
# .gen-png.sh path/or/url/to/asciicast.json path/to/output.png seconds-in

phantomjs \
  gen-png.js \
  $1 \
  $2 \
  png \
  npt:$3 \
  2
