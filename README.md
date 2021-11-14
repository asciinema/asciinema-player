_Note: This README applies to development branch. See the version for the latest stable release [here](https://github.com/asciinema/asciinema-player/blob/master/README.md)._

# asciinema player

[![Build status](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml/badge.svg)](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml)

Web player for terminal session recordings (as produced
by [asciinema recorder](https://github.com/asciinema/asciinema)) that you can
use on your own website.

## About

asciinema player is an open-source terminal session player written in
Javascript and Rust/WASM. Unlike other _video_ players asciinema player doesn't play
heavy-weight video files (`.mp4`, `.webm` etc) and instead plays light-weight
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

* ability to copy-paste terminal content - it's just a text after all!,
* ultra smooth, timing-accurate playback,
* [automatic font scaling](#fit) to fit into container element in most efficient way,
* [idle time optimization](#idletimelimit) to skip longer periods of inactivity,
* [predefined and custom font sizes](#fontsize),
* [NPT-based or custom text poster](#poster),
* [adjustable playback speed](#speed),
* [looped playback](#loop), infinite or finite,
* [starting playback at specific time](#startat),
* [keyboard shortcuts](#keyboard-shortcuts),
* [multiple color schemes for standard 16 colors](#theme),
* full support for 256 color palette and 24-bit true color (ISO-8613-3),
* full-screen mode.

## Quick start

The following examples show how to use asciinema player on your own website,
without depending on asciinema.org.

It assumes you have obtained terminal session recording file by either:

* recording terminal session to a local file with `asciinema rec demo.cast`
  ([more details on recording](https://github.com/asciinema/asciinema)),
* downloading an existing recording from asciinema.org by appending `.cast` to the
  asciicast page URL (for example: https://asciinema.org/a/28307.cast).

### Use the standalone player bundle in your HTML page

Download latest version of the player bundle from
[releases page](https://github.com/asciinema/asciinema-player/releases). You
only need `asciinema-player.min.js` and `asciinema-player.css` files.

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

### Use the player in your own application bundle

Add `asciinema-player` to your `devDependencies`:

```bash
npm install --save-dev asciinema-player@3.0.0-beta.3
```

Add empty `<div id="demo"></div>` element to your page to contain the player.

Import and use `create` function from `asciinema-player` module:

```javascript
import * as AsciinemaPlayer from 'asciinema-player';
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'));
```

Finally, include player's CSS file - found in the npm package at
`dist/bundle/asciinema-player.css` - in your CSS bundle.

## API

To mount the player in your page call the `create` function exported by the
`asciinema-player` ES module with 2 arguments: the URL (or path) to the
asciicast file and the container DOM element to mount the player in.

```javascript
const player = AsciinemaPlayer.create(url, containerElement);
```

The returned object contains the following attributes:

- `el` - DOM element of the player
- `dispose` - a function to dispose the player, i.e. to remove it from the page

To pass additional options when mounting the player turn the first argument into
an object with `src` attribute and any number of options:

```javascript
AsciinemaPlayer.create({
  src: '/demo.cast',
  loop: true,
  theme: 'solarized-dark'
}, document.getElementById('demo'));
```

See below for a full list of available options.

### `cols`

Type: number

Number of columns of player's terminal.

When not set it defaults to 80 (until asciicast gets loaded) and to terminal
width saved in the asciicast file (after it gets loaded).

It's recommended to set it to the same value as in asciicast file to prevent
player to resize itself from 80x24 to the actual dimensions of the asciicast
when it gets loaded.

### `rows`

Type: number

Number of lines of player's terminal.

When not set it defaults to 24 (until asciicast gets loaded) and to terminal
height saved in the asciicast file (after it gets loaded).

Same recommendation as for `cols` applies here.

### `autoPlay`

Type: boolean

Set this option to `true` if playback should start automatically.

Defaults to `false` - no auto play.

### `preload`

Type: boolean

Set this option to `true` if the recording should be preloaded on player's
initialization.

Defaults to `false` - no preload.

### `loop`

Type: boolean or number

Set this option to either `true` or a number if playback should be looped. When
set to a number (e.g. `3`) then the recording will be re-played given number of
times and stopped after that.

Defaults to `false` - no looping.

### `startAt`

Type: number or string

Start playback at a given time.

Supported formats:

* `123` (number of seconds)
* `"2:03"` ("mm:ss")
* `"1:02:03"` ("hh:mm:ss")

Defaults to `0`.

### `speed`

Type: number

Playback speed. The value of `2` means 2x faster.

Defaults to `1` - normal speed.

### `idleTimeLimit`

Type: number

Limit terminal inactivity to a given number of seconds.

For example, when set to `2` any inactivity longer than 2 seconds will be
"compressed" to 2 seconds.

Defaults to:

- `idle_time_limit` from asciicast header (saved when passing `-i <sec>` to
  `asciinema rec`),
- no limit, when it was not specified at the time of recording.

### `theme`

Type: string

Terminal color theme.

One of:

* `"asciinema"`
* `"monokai"`
* `"tango"`
* `"solarized-dark"`
* `"solarized-light"`

Defaults to `"asciinema"`.

You can also [use a custom theme](https://github.com/asciinema/asciinema-player/wiki/Custom-terminal-themes).

### `poster`

Type: string

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
  poster: 'npt:1:23'
}, document.getElementById('demo'));
```

Alternatively, a `poster` value of `data:text/plain,This will be printed as
poster\n\rThis in second line` will display arbitrary text. All [ANSI escape
codes](https://en.wikipedia.org/wiki/ANSI_escape_code) can be used to add color
and move the cursor around to produce good looking poster.

Example of using custom text poster with control sequences (aka escape codes):

```javascript
AsciinemaPlayer.create({
  src: '/demo.cast',
  poster: "data:text/plain,I'm regular \x1b[1;32mI'm bold green\x1b[3BI'm 3 lines down"
}, document.getElementById('demo'));
```

Defaults to blank terminal or, when `startAt` is specified, to screen contents
at time specified by `startAt`.

### `fit`

Type: string

Controls the player's fitting (sizing) behaviour inside its container element.

Possible values:

* `"width"` - scale to full width of the container
* `"height"` - scale to full height of the container (requires the container element to have fixed height)
* `"both"` - scale to either full width or height, maximizing usage of available space (requires the container element to have fixed height)
* `false` / `"none"` - don't scale, use fixed size font (also see `fontSize` option below)

Defaults to `"width"`.

> Version 2.x of the player supported only the behaviour represented by the
> `false` value. If you're upgrading from v2 to v3 and want to preserve the sizing
> behaviour then include `fit: false` option.

### `fontSize`

Type: string

Size of the terminal font.

Possible values:

* `"small"`
* `"medium"`
* `"big"`
* any valid CSS `font-size` value (e.g. `"15px"`)

Defaults to `"small"`.

> This option is effective only when `fit: false` option is specified as well
> (see above).

## Keyboard shortcuts

The following keyboard shortcuts are currently available (when the player
element is focused):

* <kbd>space</kbd> - play / pause
* <kbd>f</kbd> - toggle fullscreen mode
* <kbd>←</kbd> / <kbd>→</kbd> - rewind 5 seconds / fast-forward 5 seconds
* <kbd>0</kbd>, <kbd>1</kbd>, <kbd>2</kbd> ... <kbd>9</kbd> - jump to 0%, 10%, 20% ... 90%

## Development

The project requires [Node.js](https://nodejs.org/),
[npm](https://www.npmjs.com/) and [Rust](https://www.rust-lang.org/) for
development and build related tasks so make sure you have the latest versions
installed.

To build the project:

    git clone https://github.com/asciinema/asciinema-player
    cd asciinema-player
    git submodule update --init
    npm install
    npm run build
    npm run bundle

This produces:

- `dist/index.js` - ES module, to be `import`-ed in your JS bundle
- `dist/bundle/asciinema-player.js` - standalone player script, to be linked directly from a website
- `dist/bundle/asciinema-player.min.js` - minimized version of the above
- `dist/bundle/asciinema-player.css` - stylesheet, to be linked directly from a website or included in a CSS bundle

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors).

## License

Copyright &copy; 2011-2021 Marcin Kulik.

All code is licensed under the Apache License, Version 2.0. See LICENSE file for details.
