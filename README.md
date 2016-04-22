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
  asciinema.player.js.CreatePlayer('player-container', '/demo.json');
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
    asciinema.player.js.CreatePlayer('player-container', '/demo.json');
  </script>
</body>
</html>
```

## API

Create the player widget with the following JavaScript code:

```javascript
asciinema.player.js.CreatePlayer(parent, asciicastURL, options)
```

where:

* `parent` - DOM element into which the player should be inserted (as the only child),
* `asciicastURL` - URL of the asciicast JSON file to play,
* `options` - (optional) options object (see below).

### Options

#### `width`

Width of the player (as a number of terminal columns).

When not set it defaults to 80 (until asciicast gets loaded) and to width saved
in the asciicast file (after it gets loaded).

It's recommended to set it to the same value as in asciicast file to prevent
player to resize itself from 80x24 to the actual dimensions of the asciicast
when it gets loaded.

#### `height`

Height of the player (as a number of terminal lines).

When not set it defaults to 24 (until asciicast gets loaded) and to height saved
in the asciicast file (after it gets loaded).

Same recommendation as for `width` applies here.

#### `autoPlay`

Set to true if playback should start automatically. Defaults to `false`.

### `preload`

Set to true if the recording should be preloaded on player's initialization.
Defaults to `false`.

#### `loop`

Set to true if playback should be looped. Defaults to `false`.

#### `startAt`

Start playback at given time.

Supported formats:

* 123 (number of seconds)
* "2:03" (string in format "mm:ss")
* "1:02:03" (string in format "hh:mm:ss")

Defaults to 0.

#### `speed`

Playback speed. Defaults to 1 (normal speed).

#### `poster`

Poster (preview) to display before playback start.

Can be specified either as text (possibly containing escape sequences) or as an
array containing line fragments.

To use text, the `poster` value should be in the following format:

    data:text/plain,this will be printed as poster\n\rthis in second line

All [ANSI escape codes](https://en.wikipedia.org/wiki/ANSI_escape_code) can be
used to add color and move the cursor around to produce good looking poster. You
need to replace usual `\xXX` hex syntax with Unicode `\u00XX` though:

    data:text/plain,I'm regular \u001b[1;32mI'm bold green\u001b[3BI'm 3 lines down

The alternative to text poster is a JavaScript array poster describing contents of terminal lines:

    [
      [["some text with default color attributes", {}]], // line 1
      [["red text", { "fg": 1 }], ["blue bg text", { "bg": 2 }]], // line 2
      [["bold text", { "bold": true }], ["underlined text", { "underline": true }], ["italic text", { "italic": true }]] // line 3
    ]

The above array poster can be also passed in as BASE64 encoded JSON like this:

    data:application/json;base64,<base64-encoded-json-array>

You can use `btoa(JSON.stringify(arr))` in JavaScript (console) to BASE64-encode
the line array.

Defaults to blank terminal.

#### `fontSize`

Size of the terminal font.

Possible values:

* `small`
* `medium`
* `big`
* any CSS `font-size` value (e.g. `15px`)

Defaults to `small`.

#### `theme`

Terminal color theme.

One of:

* `asciinema`
* `tango`
* `solarized-dark`
* `solarized-light`
* `monokai`

Defaults to `asciinema`.

#### `title`

Title of the asciicast, displayed in the titlebar in fullscreen mode.

#### `author`

Author of the asciicast, displayed in the titlebar in fullscreen mode.

#### `authorURL`

URL of the author's homepage/profile. Author name (`author` above) is linked to
this URL.

#### `authorImgURL`

URL of the author's image, displayed in the titlebar in fullscreen mode.

### Example usage with options

```html
<div id="player-container"></div>
<script>
  asciinema.player.js.CreatePlayer(
    "player-container",
    "/demo.json",
    {
      speed: 2,
      theme: "solarized-dark",
      poster: "data:text/plain,\u001b[5;5HAwesome \u001b[1;33mdemo!"
    }
  );
</script>
```

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

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors).

## License

Copyright &copy; 2011-2016 Marcin Kulik.

All code is licensed under the GPL, v3 or later. See LICENSE file for details.
