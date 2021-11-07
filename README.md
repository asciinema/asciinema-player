_Note: This is README for `development` branch. [See the version for latest stable release](https://github.com/asciinema/asciinema-player/blob/master/README.md)._

# asciinema player

[![Build Status](https://travis-ci.org/asciinema/asciinema-player.svg?branch=develop)](https://travis-ci.org/asciinema/asciinema-player)

Web player for terminal session recordings (as produced
by [asciinema recorder](https://github.com/asciinema/asciinema)) that you can
use on your own website.

## About

asciinema player is an open-source terminal session player written in
Javascript and Rust/WASM. Contrary to other _video_ players asciinema player doesn't play
heavy-weight video files (`.mp4`, `.webm` etc) but instead plays light-weight
terminal session files called
[asciicasts](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md).

Asciicast is a capture of terminal's raw output, which has to be interpreted
during the playback, so the player comes with its own interpreter based on [Paul
Williams' parser for ANSI-compatible video
terminals](https://vt100.net/emu/dec_ansi_parser). Its output is fully compatible
with most widely used terminal emulators like xterm, Gnome Terminal, iTerm etc.

You can see the player in action on [asciinema.org](https://asciinema.org).

If you don't want to depend on asciinema.org and you prefer to host the player
and the recordings yourself then read on, it's very simple.

## Features

* ~~HTML5 [`<asciinema-player>` element](#use-the-player-in-your-html-page) you can use in your website's markup,~~
* copy-paste of terminal content (it's just a text after all!),
* [idle time optimization](#idletimelimit),
* [predefined and custom font sizes](#fontsize),
* [custom poster](#poster),
* [custom playback speeds](#speed),
* [looped playback](#loop),
* 🚧 [starting playback at specific time](#startat),
* [keyboard shortcuts](#keyboard-shortcuts),
* [multiple color schemes for standard 16 colors](#theme),
* 256 color palette / 24-bit true color (ISO-8613-3),
* full-screen mode.

## Quick start

The following example shows how to use asciinema player on your own website,
without depending on asciinema.org.

It assumes you have obtained terminal session recording file by either:

* recording terminal session to a local file with `asciinema rec demo.cast`
  ([more details on recording](https://github.com/asciinema/asciinema)),
* downloading an existing recording from asciinema.org by appending `.cast` to the
  asciicast page URL (for example: https://asciinema.org/a/28307.cast).

### Download the standalone player bundle

Download latest version of the player from
[releases page](https://github.com/asciinema/asciinema-player/releases). You
only need `asciinema-player.min.js` and `asciinema-player.css` files.

### Use the player in your HTML page

First, add `asciinema-player.min.js`, `asciinema-player.css`and the `.cast` file of
your recording to your site's assets. The HTML snippet below assumes they're in
the web server's root directory.

Then add necessary includes to your HTML document and initialize the player
inside an empty `<div>` element:

```html
<html>
<head>
  ...
  <link rel="stylesheet" type="text/css" href="/asciinema-player.css" />
  ...
</head>
<body>
  ...
  <div id="demo"></div>
  ...
  <script src="/asciinema-player.min.js"></script>
  <script>
    AsciinemaPlayer.create('/demo.cast', document.getElementById('demo));
  </script>
</body>
</html>
```

> This example demonstrates the use of the standalone JS/CSS bundles but you
> can use the npm package in your own JS bundle as well - see the API section
> below.

## API

If you're using the standalone JS bundle then call `create` through the
`window.AsciinemaPlayer` proxy:

```javascript
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'));
```

If you're using npm package then import and use the `create` function from
`asciinema-player` module:

```javascript
import { create } from 'asciinema-player';
create('/demo.cast', document.getElementById('demo'));
```

If you need to pass additional options to the player then turn the first
argument into an object containing `src` (path/URL to the recording) and any
number of options:

```javascript
AsciinemaPlayer.create({
  src: '/demo.cast',
  loop: true,
  theme: 'solarized-dark'
}, document.getElementById('demo'));
```

See below for a full list of available options.

### `cols` - number

Number of columns of player's terminal.

When not set it defaults to 80 (until asciicast gets loaded) and to terminal
width saved in the asciicast file (after it gets loaded).

It's recommended to set it to the same value as in asciicast file to prevent
player to resize itself from 80x24 to the actual dimensions of the asciicast
when it gets loaded.

### `rows` - number

Number of lines of player's terminal.

When not set it defaults to 24 (until asciicast gets loaded) and to terminal
height saved in the asciicast file (after it gets loaded).

Same recommendation as for `cols` applies here.

### `autoplay` - boolean

Set this option to `true` if playback should start automatically.

Defaults to `false` - no auto play.

### `preload` - boolean

Set this option to `true` if the recording should be preloaded on player's
initialization.

Defaults to `false` - no preload.

### `loop` - boolean or number

Set this option to either `true` or a number if playback should be looped. When
set to a number (e.g. `3`) then the recording will be re-played given number of
times and stopped after that.

Defaults to `false` - no looping.

### `startAt` - number or string

Start playback at a given time.

Supported formats:

* 123 (number of seconds)
* 2:03 ("mm:ss")
* 1:02:03 ("hh:mm:ss")

Defaults to `0`.

### `speed` - number

Playback speed. The value of `2` means 2x faster.

Defaults to `1` - normal speed.

### `idleTimeLimit` - number

Limit terminal inactivity to a given number of seconds.

For example, when set to `2` any inactivity longer than 2 seconds will be
"compressed" to 2 seconds.

Defaults to:

- `idle_time_limit` from asciicast header (saved when passing `-i <sec>` to
  `asciinema rec`),
- no limit, when it was not specified at the time of recording.

### `poster` - string

Poster (a preview frame) to display until the playback is started.

The following poster specifications are supported:

* `npt:1:23` - display recording "frame" at given time using [NPT ("Normal Play Time") notation](https://www.ietf.org/rfc/rfc2326.txt)
* `data:text/plain,Poster text` - print given text

The easiest way of specifying a poster is to use NPT format. For example,
`npt:1:23` will preload the recording and display terminal contents at 1 min 23
sec.

Example:

```javascript
AsciinemaPlayer.create({
  src: '/demo.cast',
  poster: 'npt:2:34'
}, document.getElementById('demo'));
```

Alternatively, a `poster` value of `data:text/plain,This will be printed as
poster\n\rThis in second line` will display arbitrary text. All [ANSI escape
codes](https://en.wikipedia.org/wiki/ANSI_escape_code) can be used to add color
and move the cursor around to produce good looking poster.

Example of using text poster with cursor positioning:

```javascript
AsciinemaPlayer.create({
  src: '/demo.cast',
  poster: "data:text/plain,I'm regular \x1b[1;32mI'm bold green\x1b[3BI'm 3 lines down"
}, document.getElementById('demo'));
```

Defaults to blank terminal or, when `startAt` is specified, to screen contents
at time `startAt`.

### `fit` - string

Controls how the player should fit inside its containing element (2nd arg to
`create`).

Possible values:

* `"width"` - scale to full width of the container
* `"height"` - scale to full height of the container (requires the container element to have fixed height)
* `"both"` - scale to either full width or height, maximizing usage of available space (requires the container element to have fixed height)
* `false` / `"none"` - don't scale the player - use fixed size font (see also `fontSize` option below)

Defaults to `"width"`.

> Version 2.x of the player supported only the behaviour represented by the
> `false` value. If you're upgrading from v2 to v3 and want to preserve the sizing
> behaviour then include `fit: false` option.

### `fontSize` - string

Size of the terminal font.

Possible values:

* `"small"`
* `"medium"`
* `"big"`
* any valid CSS `font-size` value (e.g. `"15px"`)

Defaults to `"small"`.

> This option is effective only when `fit: false` option (see above) is
> specified as well.

### `theme` - string

Terminal color theme.

One of:

* `"asciinema"`
* `"monokai"`
* `"tango"`
* `"solarized-dark"`
* `"solarized-light"`

Defaults to `"asciinema"`.

You can also [use a custom theme](https://github.com/asciinema/asciinema-player/wiki/Custom-terminal-themes).

## Keyboard shortcuts

The following keyboard shortcuts are currently available (when the player
element is focused):

* `space` - play / pause
* `f` - toggle fullscreen mode
* `←` / `→` - rewind 5 seconds / fast-forward 5 seconds
* `0, 1, 2 ... 9` - jump to 0%, 10%, 20% ... 90%

## Development

The project requires [Node.js](https://nodejs.org/),
[npm](https://www.npmjs.com/) and [Rust](https://www.rust-lang.org/) for
development and build related tasks so make sure you have the latest versions
installed.

To build the project:

    git clone https://github.com/asciinema/asciinema-player
    cd asciinema-player
    npm install
    npm run build

This produces:

- `public/asciinema-player.js` - standalone player script, to be linked directly from a website
- `public/asciinema-player.min.js` - minimized version of the above
- `public/asciinema-player.css` - stylesheet, to be linked directly from a website or included a CSS bundle
- `dist/index.js` - ES module, to be `import`-ed in your JS bundle

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors).

## License

Copyright &copy; 2011-2021 Marcin Kulik.

All code is licensed under the Apache License, Version 2.0. See LICENSE file for details.
