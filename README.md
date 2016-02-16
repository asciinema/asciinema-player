# asciinema player

[![Build Status](https://travis-ci.org/asciinema/asciinema-player.svg?branch=master)](https://travis-ci.org/asciinema/asciinema-player)

Web player for terminal session recordings (as produced by
[asciinema recorder](https://github.com/asciinema/asciinema)) that you can use
on your website.

## About

asciinema player is an open-source terminal session player written in
ClojureScript. Contrary to other "video" players asciinema player doesn't play
heavy-weight video files (`.mp4`, `.webm` etc) but instead it plays light-weight
terminal session files called
[asciicasts](https://github.com/asciinema/asciinema/blob/master/doc/asciicast-v1.md).

Asciicast is a capture of terminal's raw output and thus the player comes with
its own terminal emulator based on
[Paul Williams' parser for ANSI-compatible video terminals](http://vt100.net/emu/dec_ansi_parser).
It covers only the display part of the emulation as this is what the player is
about (input is handled by your terminal+shell at the time of recording anyway)
and its handling of escape sequences is fully compatible with most modern
terminal emulators like xterm, Gnome Terminal, iTerm, mosh etc.

Features:

* copy-paste of terminal content (it's just a text after all!),
* predefined and custom font sizes,
* custom playback speeds,
* looped playback,
* starting playback at specific time,
* keyboard shortcuts,
* multiple color schemes,
* full-screen mode.

You can see the player in action on [asciinema.org](https://asciinema.org).

If you don't want to depend on asciinema.org and you prefer to host the player
and the recordings yourself then read on, it's very simple.

## Quick start

The following example assumes you have obtained terminal session recording file
by either:

* recording terminal session to a local file with `asciinema rec demo.json`
  ([more details on recording](https://github.com/asciinema/asciinema)),
* downloading an existing recording from asciinema.org by appending `.json` to the
  asciicast page URL (for example: https://asciinema.org/a/28307.json).

### Download the player

Download latest version of the player from
[releases page](https://github.com/asciinema/asciinema-player/releases). You
only need `asciinema-player.js` and `asciinema-player.css` files.

### Use the player in your HTML page

First, add player files (`asciinema-player.js` and `asciinema-player.css`)
together with the recording `demo.json` file to your site assets.

Then add necessary includes to your document's `<head>`:

```html
<link rel="stylesheet" type="text/css" href="/asciinema-player.css" />
<script src="/asciinema-player.js"></script>
```

Now, add empty `<div>` element in your markup where you want the player to show
up, assigning it `id` attribute. Then initialize the player with this id and the
URL of the `.json` file containing the recording:

```html
<div id="player-container"></div>
<script>
  asciinema_player.core.CreatePlayer('player-container', '/demo.json');
</script>
```

Complete example:

```html
<html>
<head>
  <link rel="stylesheet" type="text/css" href="/asciinema-player.css" />
  <script src="/asciinema-player.js"></script>
</head>
<body>
  <div id="player-container"></div>
  <script>
    asciinema_player.core.CreatePlayer('player-container', '/demo.json');
  </script>
</body>
</html>
```

## API

Create the player widget with the following JavaScript code:

```javascript
asciinema_player.core.CreatePlayer(parent, asciicastURL, options)
```

where:

* `parent` - DOM element into which the player should be inserted (as the only child),
* `asciicastURL` - URL of the asciicast JSON file to play,
* `options` - (optional) object with any of the following properties:
  * `width` - width of the player (number of terminal columns),
  * `height` - height of the player (number of terminal lines),
  * `autoPlay` - set to true if playback should start automatically, default: `false`,
  * `loop` - set to true if playback should be looped, default: `false`,
  * `startAt` - start playback at given time (123, "2:03", "1:02:03"), default: 0,
  * `speed` - playback speed, default: 1,
  * `poster` - poster (preview) to display before playback start, default: blank terminal,
  * `fontSize` - size of terminal font: `'small'`, `'medium'`, `'big'` or
     any CSS `font-size` value (e.g. `15px`); default: `'small'`,
  * `theme` - terminal theme, one of `'asciinema'`, `'tango'`, `'solarized-dark'`,
    `'solarized-light'`, `'monokai'`; default: `'asciinema'`,
  * `title` - title of the asciicast, displayed in the titlebar in fullscreen mode,
  * `author` - author of the asciicast, displayed in the titlebar in fullscreen mode,
  * `authorURL` - URL of the author's homepage/profile,
  * `authorImgURL` - URL of the author's image, displayed in the titlebar in fullscreen mode

For example:

```html
<div id="player-container"></div>
<script>
  asciinema_player.core.CreatePlayer('player-container', '/demo.json', { speed: 2, theme: 'solarized-dark' });
</script>
```

`CreatePlayer` doesn't return anything useful yet (that's why we're not storing
its result in a variable). In the future it will return a "control object" for
programmatic control of the playback.

### Controlling the Player
Here are some jQuery workarounds for controlling the player pending development of a formal API.  Note that these work only with an embedded player.

Action | Coding
------ | ------
Start or stop the player | $(".playback-button").trigger("click") 
Determine if player is playing | 2 == $(".playback-button")[0].getElementsByTagName("path").length
Fetch elapsed time | $(".time-elapsed").text()
Fetch remaining time | $(".time-remaining").text()

## Keyboard shortcuts

The following keyboard shortcuts are currently available (when the player
element is focused):

* `space` - play / pause
* `f` - toggle fullscreen mode
* `←` / `→` - rewind 5 seconds / fast-forward 5 seconds
* `0, 1, 2 ... 9` - jump to 0%, 10%, 20% ... 90%
* `<` / `>` - decrease / increase playback speed

## Development

The project uses [leiningen](http://leiningen.org/) for development and build
related tasks so make sure you have it installed (as well as Java 7 or 8).

Start local web server with auto-compilation and live code reloading in the browser:

    lein figwheel dev

Start auto-compilation of `.less` files:

    lein less auto

Once the above tasks are running, open [localhost:3449](http://localhost:3449/)
in the browser to load the player with sample asciicast. Any changes made to
`.cljs` or `.less` files will be automatically pushed to the browser, preserving
player's state.

Run tests with:

    lein doo phantom test

### Building from source

To build stand-alone `.js` and `.css` files run:

    lein cljsbuild once release
    lein less once

This produces `resources/public/js/release.js` and `resources/public/css/main.css`.

## TODO

* make `CreatePlayer` return "control object"
* add hooks (start/pause/resume/finish)
* figure out if GPL is compatible with Clojure(Script)'s EPL

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors).

## License

Copyright &copy; 2011-2016 Marcin Kulik.

All code is licensed under the GPL, v3 or later. See LICENSE file for details.
