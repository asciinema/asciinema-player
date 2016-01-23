# asciinema player changelog

## master

* `startAt` option doesn't imply `autoPlay: true` anymore
* `fontSize` option accepts any CSS `font-size` value (e.g. `15px`)

## 2.0.0 (2016-01-06)

* New API
* Added support for direct playback of asciicast V1 format
* New option: `startAt`, for specifying playback start point (in seconds)
* Improved rendering of lines with non-monospace characters
* New keyboard shortcuts
* New themes: asciinema, Monokai
* Displaying title and author info in full-screen mode

## 1.2.0 (2015-04-23)

* Simplified API
* Keyboard shortcuts: space for pause/resume, "f" for toggle full-screen mode
* Official asciinema logo is now used as the big "play button"
* Fixed `loop` option in some edge cases
* Improved progress bar behavior

## 1.1.0 (2014-07-27)

* New option: `loop`
* Support for Powerline Symbols font
* Improved line height across devices/browsers
* Many minor visual tweaks and fixes
* New theme: Solarized Light

## 1.0.0 (2014-05-14)

* Rewritten using React.js
* Improved seeking performance

## 0.1 (2013-10-04)

* Initial version (source code in asciinema.org repository)
