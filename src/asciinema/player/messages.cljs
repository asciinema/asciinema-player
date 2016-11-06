(ns asciinema.player.messages)

(defprotocol Update
  (update-player [this player]))

(defprotocol ChannelSource
  (get-channels [this player]))

;;; UI originated messages

(defrecord FastForward [])

(defrecord Rewind [])

(defrecord Seek [position])

(defrecord SpeedDown [])

(defrecord SpeedUp [])

(defrecord TogglePlay [])

;; Internal messages

(defrecord ShowCursor [show])

(defrecord ShowHud [show])

;;; Source originated messages

(defrecord SetMetadata [width height duration])

(defrecord SetLoading [loading])

(defrecord SetPlaying [playing])

(defrecord TriggerCanPlay [])

(defrecord UpdateScreen [screen])

(defrecord UpdateTime [time])
