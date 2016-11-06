(ns asciinema.player.screen)

(defprotocol Screen
  (lines [this])
  (cursor [this]))
