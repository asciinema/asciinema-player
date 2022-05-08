_Note: This README applies to development branch. See the version for the latest stable release [here](https://github.com/asciinema/asciinema-player/blob/master/README.md)._

# asciinema player

[![Build status](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml/badge.svg)](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml)

Web player for terminal sessions (recorded with
[asciinema](https://github.com/asciinema/asciinema)) you can use on your
website.

## About

asciinema player is an open-source terminal session player written in Javascript
and Rust. Unlike other _video_ players asciinema player doesn't play
heavy-weight video files (`.mp4`, `.webm` etc) and instead plays light-weight
terminal session files called
[asciicasts](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md).

Asciicast is a capture of terminal's raw output, which needs to be interpreted
during playback, therefore the player comes with its own interpreter based on
[Paul Williams' parser for ANSI-compatible video
terminals](https://vt100.net/emu/dec_ansi_parser). It's fully compatible with
most widely used terminal emulators like xterm, Gnome Terminal, iTerm etc.

You can see the player in action on [asciinema.org](https://asciinema.org).

If you don't want to depend on asciinema.org and you prefer to host the player
and the recordings yourself then read on, it's very simple.

## Features

* ability to copy-paste terminal content - it's just a text after all!,
* ultra smooth, timing-accurate playback,
* [automatic font scaling](#fit) to fit into container element in most efficient way,
* [idle time optimization](#idletimelimit) to skip longer periods of inactivity,
* [predefined and custom font sizes](#terminalfontsize),
* [NPT-based or custom text poster](#poster),
* [adjustable playback speed](#speed),
* [looped playback](#loop), infinite or finite,
* [starting playback at specific time](#startat),
* [API for programmatic control](#api),
* [keyboard shortcuts](#keyboard-shortcuts),
* [multiple color themes for standard 16 colors](#theme),
* full support for 256 color palette and 24-bit true color (ISO-8613-3),
* full-screen mode.

## Quick start

The following examples show how to use asciinema player on your own website.

It assumes you have obtained terminal session recording file by either:

* recording terminal session to a local file with `asciinema rec demo.cast`
  ([more details on recording](https://github.com/asciinema/asciinema)),
* downloading an existing recording from asciinema.org by appending `.cast` to the
  asciicast page URL (for example: https://asciinema.org/a/28307.cast).

### Use standalone player bundle in your HTML page

Build the latest version of the player bundle by following the instructions at [Development](#Development) below. You
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
    AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'));
  </script>
</body>
</html>
```

### Use the player in your own application bundle

Add `asciinema-player` to your `devDependencies`:

```bash
npm install --save-dev asciinema-player@3.0.0
```

Add empty `<div id="demo"></div>` element to your page to contain the player.

Import and use `create` function from `asciinema-player` module:

```javascript
import * as AsciinemaPlayer from 'asciinema-player';
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'));
```

Finally, include player's CSS file in your site CSS bundle. You'll find it in
the npm package at `dist/bundle/asciinema-player.css`.

## Basic usage

To mount the player on your page use the `create` function exported by the
`asciinema-player` ES module with 2 arguments: the URL (or path) to the
asciicast file and the container DOM element to mount the player in.

```javascript
AsciinemaPlayer.create(url, containerElement);
```

You can tweak file fetching by passing `{ url: "...", fetchOpts: { ... } }` as
the 1st argument to `create`. `fetchOpts` object is then passed to
[fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) (as its 2nd
argument). This can be used to change HTTP method, configure credentials, etc.

If you'd like to inline the recording contents you can do so with [Data
URLs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs).
For example:

```javascript
AsciinemaPlayer.create(
  'data:text/plain;base64,eyJ2ZXJzaW9uIjogMiwgIndpZHRoIjogODAsICJoZWlnaHQiOiAyNH0KWzAuMSwgIm8iLCAiaGVsbCJdClswLjUsICJvIiwgIm8gIl0KWzIuNSwgIm8iLCAid29ybGQhXG5cciJdCg==',
  containerElement
);
```

See [Source](#source) for more ways of loading a recording into the player.

To pass additional options when mounting the player use 3 argument variant:

```javascript
AsciinemaPlayer.create(url, containerElement, opts);
```

For example, enable looping and select Solarized Dark theme:

```javascript
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
  loop: true,
  theme: 'solarized-dark'
});
```

See [Options](#options) for full list of available options.

If you'd like to control the player programatically then you can use the
functions exposed on the object returned from `create` function:

```javascript
const player = AsciinemaPlayer.create(url, containerElement);

player.play();
```

See [API](#api) for details.

## Source

In the most common case the recording to be played is fetched from a URL. If
you'd like to load it from a different source you can pass it to `create` as `{
data: data }` where `data` can be one of:

- a string containing asciicast in [v1](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v1.md) or [v2](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md) format
- an object representing asciicast in [v1](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v1.md) format
- an array representing asciicast in [v2](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md) format
- a function which when invoked returns any of the above (may be async)

For example:

```javascript
AsciinemaPlayer.create({ data: data }, containerElement);
```

`data` value is defined in one of the following ways:

```javascript
// object representing asciicast in v1 format
{version: 1, width: 80, height: 24, stdout: [[1.0, "hello "], [1.0, "world!"]]};
```

```javascript
// string representing asciicast in v1 format (json)
'{"version": 1, "width": 80, "height": 24, "stdout": [[1.0, "hello "], [1.0, "world!"]]}';
```

```javascript
// array representing asciicast in v2 format
[
  {version: 2, width: 80, height: 24},
  [1.0, "o", "hello "],
  [2.0, "o", "world!"]
]
```

```javascript
// string representing asciicast in v2 format (ndjson)
'{"version": 2, "width": 80, "height": 24}\n[1.0, "o", "hello "]\n[2.0, "o", "world!"]';
```

```javascript
// function returning a string representing asciicast in v2 format (ndjson)
() => '{"version": 2, "width": 80, "height": 24}\n[1.0, "o", "hello "]\n[2.0, "o", "world!"]';
```

If `data` is a function then the player invokes the function when playback is
started by a user. If `preload: true` option is used then the function is
invoked during player initialization.

## Options

The following options can be used to tweak player's look and feel:

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
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
  poster: 'npt:1:23'
});
```

Alternatively, a `poster` value of `data:text/plain,This will be printed as
poster\n\rThis in second line` will display arbitrary text. All [ANSI escape
codes](https://en.wikipedia.org/wiki/ANSI_escape_code) can be used to add color
and move the cursor around to produce good looking poster.

Example of using custom text poster with control sequences (aka escape codes):

```javascript
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
  poster: "data:text/plain,I'm regular \x1b[1;32mI'm bold green\x1b[3BI'm 3 lines down"
});
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

### `terminalFontSize`

Type: string

Size of the terminal font.

Possible values:

* `"small"`
* `"medium"`
* `"big"`
* any valid CSS `font-size` value, e.g. `"15px"`

Defaults to `"small"`.

> This option is effective only when `fit: false` option is specified as well
> (see above).

### `terminalFontFamily`

Type: string

Terminal font-family override.

Use any valid CSS `font-family` value, e.g `"'JetBrains Mono', Consolas, Menlo, 'Bitstream Vera Sans Mono', monospace"`.

### `terminalLineHeight`

Type: number

Terminal line height override.

The value is relative to the font size (like `em` unit in CSS). For example a
value of `1` makes the line height equal to the font size, leaving no space
between lines. A value of `2` makes it double the font size, etc.

Defaults to `1.33333333`.

## API

```javascript
import * as AsciinemaPlayer from 'asciinema-player';
// skip the above import when using standalone player bundle

const player = AsciinemaPlayer.create(url, containerElement);
```

The object returned by `create` function (saved as `player` const above)
contains several functions that can be used to control the player from
your code.

For example, initiate playback and print the recording duration when it starts:

```javascript
player.play().then(() => {
  console.log(`started! duration: ${player.getDuration()}`);
});
```

The following functions are available on the player object:

### `getCurrentTime()`

Returns the current playback time in seconds.

```javascript
player.getCurrentTime(); // => 1.23
```

### `getDuration()`

Returns the length of the recording in seconds, or `null` if the recording is
not loaded yet.

```javascript
player.getDuration(); // => 123.45
```

### `play()`

Initiates playback of the recording. If the recording hasn't been
[preloaded](#preload) then it's loaded, and playback is started.

```javascript
player.play();
```

This function returns a promise which is fulfilled when the playback actually
starts.

```javascript
player.play().then(() => {
  console.log(`started! duration: ${player.getDuration()}`);
});
```

If you want to synchronize asciinema player with other elements on the page (for
example `<audio>` element) then you can use this promise for coordination.
Alternatively you can add event listener for `play` event (see below).

### `pause()`

Pauses playback.

```javascript
player.pause();
```

The playback is paused immediately.

### `seek(t)`

Changes the playback location to time `t` given in seconds (e.g. `15`) or
percentage (e.g `'50%'`).

This function returns a promise which is fulfilled when the location actually
changes.

```javascript
player.seek(15).then(() => {
  console.log(`current time: ${player.getCurrentTime()}`);
});
```

### `addEventListener(eventName, handler)`

Adds event listener, binding handler's `this` to the player object.

The `play` event is dispatched when playback starts or resumes from pause.

```javascript
player.addEventListener('play', () => {
  console.log(`playing! we're at: ${this.getCurrentTime()}`);
})
```

The `pause` event is dispatched when playback is paused.

```javascript
player.addEventListener('pause', () => {
  console.log("paused!");
})
```

The `ended` event is dispatched when playback stops after reaching the end of
the recording.

```javascript
player.addEventListener('ended', () => {
  console.log("ended!");
})
```

### `dispose()`

Use this function to dispose of the player, i.e. to shut it down, release all
resources and remove it from DOM.

## Keyboard shortcuts

The following keyboard shortcuts are currently available (when the player
element is focused):

* <kbd>space</kbd> - play / pause
* <kbd>f</kbd> - toggle fullscreen mode
* <kbd>←</kbd> / <kbd>→</kbd> - rewind by 5 seconds / fast-forward by 5 seconds
* <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>Shift</kbd> + <kbd>→</kbd> - rewind by 10% / fast-forward by 10%
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
    rustup target add wasm32-unknown-unknown
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

Copyright &copy; 2011-2022 Marcin Kulik.

All code is licensed under the Apache License, Version 2.0. See LICENSE file for details.
