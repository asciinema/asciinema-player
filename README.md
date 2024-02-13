# asciinema player

[![Build status](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml/badge.svg)](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml)

Web player for terminal sessions recorded with
[asciinema](https://github.com/asciinema/asciinema), which you can use on your
own website.

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

* ability to copy-paste terminal content - it's just text after all!
* smooth, timing-accurate playback,
* [idle time optimization](#idletimelimit) to skip periods of inactivity,
* [posters](#poster),
* [markers](#markers-1) for navigation or auto-pause,
* configurable [font families](#fonts) and [line height](#terminallineheight),
* [automatic terminal scaling](#fit) to fit into container element in most efficient way,
* full-screen mode,
* [multiple color themes for standard 16 colors](#theme) + support for 256 color palette and 24-bit true color (ISO-8613-3),
* [adjustable playback speed](#speed),
* [looped playback](#loop), infinite or finite,
* [starting playback at specific time](#startat),
* [API for programmatic control](#api),
* [keyboard shortcuts](#keyboard-shortcuts),
* [support for other recording formats](#playing-other-recording-formats) like ttyrec, typescript.

## Quick start

The following examples show how to use asciinema player on your own website.

It assumes you have obtained terminal session recording file by either:

* recording terminal session to a local file with `asciinema rec demo.cast`
  ([more details on recording](https://github.com/asciinema/asciinema)),
* downloading an existing recording from asciinema.org by appending `.cast` to the
  asciicast page URL (for example: https://asciinema.org/a/28307.cast).

### Use standalone player bundle in your HTML page

Download latest version of the player bundle from
[releases page](https://github.com/asciinema/asciinema-player/releases). You
only need `asciinema-player.min.js` and `asciinema-player.css` files.

First, add `asciinema-player.min.js`, `asciinema-player.css`and the `.cast` file of
your recording to your site's assets. The HTML snippet below assumes they're in
the web server's root directory.

Then add necessary includes to your HTML document and initialize the player
inside an empty `<div>` element:

```html
<!DOCTYPE html>
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
npm install --save-dev asciinema-player@3.6.4
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

To mount the player on a page, use the `create` function exported by the
`asciinema-player` ES module with 2 arguments: source (recording URL) and the
container DOM element to mount the player in:

```javascript
AsciinemaPlayer.create(src, containerElement);
```

In the most common case, a recording is fetched from a URL and is in
[asciicast](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md)
format. You can pass it as full URL, e.g. `"https://example.com/demo.cast"`, or
a path, e.g. `"/demo.cast"`.

See [Source](#source) for more ways of loading a recording into the player.

To pass additional options, when mounting the player, use 3 argument variant:

```javascript
AsciinemaPlayer.create(src, containerElement, opts);
```

For example, enable looping and select Solarized Dark theme:

```javascript
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
  loop: true,
  theme: 'solarized-dark'
});
```

See [Options](#options) for full list of available options.

If you'd like to control the player programmatically, you can use the functions
exposed on the object returned from `create` function:

```javascript
const player = AsciinemaPlayer.create(src, containerElement);

player.play();
```

See [API](#api) for details.

## Source

While the easiest way of loading a recording into the player is by using
asciicast file URL, it's also easy to customize the loading procedure or even
replace it completely.

### Inlining a recording

If a recording file is small and you'd rather avoid additional HTTP request, you
can inline the recording by using [Data
URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs):

```javascript
AsciinemaPlayer.create('data:text/plain;base64,' + base64encodedAsciicast, containerElement);
```

For example:

```javascript
AsciinemaPlayer.create(
  'data:text/plain;base64,eyJ2ZXJzaW9uIjogMiwgIndpZHRoIjogODAsICJoZWlnaHQiOiAyNH0KWzAuMSwgIm8iLCAiaGVsbCJdClswLjUsICJvIiwgIm8gIl0KWzIuNSwgIm8iLCAid29ybGQhXG5cciJdCg==',
  document.getElementById('demo')
);
```

### Loading a recording from another source

If you'd like to load a recording yourself and just pass it over to the player,
use `{ data: data }` object as source argument to `create`:

```javascript
AsciinemaPlayer.create({ data: data }, containerElement);
```

where `data` can be:

- a string containing asciicast in [v1](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v1.md) or [v2](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md) format
- an object representing asciicast in [v1](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v1.md) format
- an array representing asciicast in [v2](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md) format
- a function which when invoked returns one of the above (may be async)

If `data` is a function, then the player invokes it when playback is started by
a user. If [preload](#preload) option is used, the function is invoked during
player initialization (mounting in DOM).

Provided `data` is parsed with built-in asciicast format parser by default (also
see [Playing other recording formats](#playing-other-recording-formats)).

Examples of supported `data` specifications:

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

Say you'd like to embed asciicast contents in a (hidden) HTML tag on your page,
following data source can be used to extract it and pass it to the player:

```javascript
AsciinemaPlayer.create(
  { data: document.getElementById('asciicast').textContent.trim() },
  document.getElementById('demo')
);
```

### Customizing URL fetching

If you'd like to fetch a recording from a URL, but you need to tweak how HTTP
request is performed (configure credentials, change HTTP method, etc), you can do
so by using `{ url: "...", fetchOpts: { ... } }` object as the source argument.
`fetchOpts` object is then passed to
[fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) (as its 2nd
argument).

For example:

```javascript
AsciinemaPlayer.create(
  { url: url, fetchOpts: { method: 'POST' } },
  containerElement
);
```

Alternatively, you can use custom data source (as described in previous section)
and call `fetch` yourself:

```javascript
AsciinemaPlayer.create(
  { data: () => fetch(url, { method: 'POST' }) },
  containerElement
);
```

### Playing other recording formats

By default, a recording is parsed with built-in
[asciicast](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md)
format parser.

If you have a recording produced by other terminal session recording tool (e.g.
script, termrec, ttyrec) you can use one of [built-in file format
parsers](src/parser/README.md#built-in-parsers), or [implement a custom parser
function](src/parser/README.md#custom-parser).

Recording format parser can be specified in the source argument to
`AsciinemaPlayer.create` as a string (built-in) or a function (custom):

```javascript
AsciinemaPlayer.create({ url: url, parser: parser }, containerElement);
```

See [Parsers](src/parser/README.md) for information on available built-in
parsers and how to implement a custom one.

## Options

The following options can be used to adjust look and feel of the player:

### `cols`

Type: number

Number of columns of player's terminal.

When not set it defaults to 80 (until asciicast gets loaded) and to terminal
width saved in the asciicast file (after it gets loaded).

It's recommended to set it to the same value as in asciicast file to avoid
player resizing itself from 80x24 to actual dimensions of the recording when it
gets loaded.

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

For example, when set to `2` any inactivity (pauses) longer than 2 seconds will
be "compressed" to 2 seconds.

Defaults to:

- `idle_time_limit` from asciicast header (saved when passing `-i <sec>` to
  `asciinema rec`),
- no limit, when it was not specified at the time of recording.

### `theme`

Type: string

Terminal color theme.

One of:

* `"asciinema"`
* `"dracula"`
* `"monokai"`
* `"nord"`
* `"solarized-dark"`
* `"solarized-light"`
* `"tango"`

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

Selects fitting (sizing) behaviour with regards to player's container element.

Possible values:

* `"width"` - scale to full width of the container
* `"height"` - scale to full height of the container (requires the container element to have fixed height)
* `"both"` - scale to either full width or height, maximizing usage of available space (requires the container element to have fixed height)
* `false` / `"none"` - don't scale, use fixed size font (also see `fontSize` option below)

Defaults to `"width"`.

> Version 2.x of the player supported only the behaviour represented by the
> `false` value. If you're upgrading from v2 to v3 and want to preserve the sizing
> behaviour then include `fit: false` option.

### `controls`

Type: boolean or "auto"

Hide or show user controls, i.e. bottom control bar.

Valid values:

* `true` - always show controls
* `false` - never show controls
* `"auto"` - show controls on mouse movement, hide on lack of mouse movement

Defaults to `"auto"`.

### `markers`

Type: array

Allows providing a list of timeline markers. See [Markers](#markers-1) for
information on what they're useful for.

Example of unlabeled markers:

```javascript
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
  markers: [5.0, 25.0, 66.6, 176.5]  // time in seconds
});
```

Example of labeled markers:

```javascript
AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
  markers: [
    [5.0,   "Installation"],  // time in seconds + label
    [25.0,  "Configuration"],
    [66.6,  "Usage"],
    [176.5, "Tips & Tricks"]
  ]
});
```

Markers set with this option override all [markers embedded in asciicast
files](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md#m---marker).

Defaults to markers found in the recording file.

### `pauseOnMarkers`

Type: boolean

If `pauseOnMarkers` is set to `true`, the playback automatically pauses on every
marker encountered and it can be resumed by either pressing the space bar key or
clicking on the play button. The resumed playback continues until the next
marker is encountered.

This option can be useful in e.g. live demos: you can add markers to a
recording, then play it back during presentation, and have the player stop
wherever you want to explain terminal contents in more detail.

Defaults to `false`.

### `terminalFontSize`

Type: string

Size of the terminal font.

_This option is effective only when `fit: false` option is specified as well
(see above)._

Possible values:

* any valid CSS `font-size` value, e.g. `"15px"`
* `"small"`
* `"medium"`
* `"big"`

Defaults to `"small"`.

### `terminalFontFamily`

Type: string

Terminal font-family override.

Use any valid CSS `font-family` value, e.g `"'JetBrains Mono', Consolas, Menlo, 'Bitstream Vera Sans Mono', monospace"`.

See [Fonts](#fonts) for more information on using custom fonts.

### `terminalLineHeight`

Type: number

Terminal line height override.

The value is relative to the font size (like `em` unit in CSS). For example a
value of `1` makes the line height equal to the font size, leaving no space
between lines. A value of `2` makes it double the font size, etc.

Defaults to `1.33333333`.

### `logger`

Type: console-like object

Set this option to `console` (`{ logger: console }`) or any object implementing
console API (`.log()`, `.debug()`, `.info()`, `.warn()`, `.error()` methods) to
enable logging. Useful during development or when debugging player issues.

## API

```javascript
import * as AsciinemaPlayer from 'asciinema-player';
// skip the above import when using standalone player bundle

const player = AsciinemaPlayer.create(url, containerElement);
```

The object returned by `create` function (saved as `player` const above)
contains several functions that can be used to control the player from
your code.

For example, initiate playback and print the length of the recording when it
starts:

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
Alternatively you can add event listener for `play`/`playing` events (see
below).

### `pause()`

Pauses playback.

```javascript
player.pause();
```

The playback is paused immediately.

### `seek(location)`

Changes the playback location to specified time or marker.

`location` argument can be:

- time in seconds, as number, e.g. `15`
- position in percentage, as string, e.g `'50%'`
- specific marker by its 0-based index, as `{ marker: i }` object, e.g. `{ marker: 3 }`
- previous marker, as `{ marker: 'prev' }` object,
- next marker, as `{ marker: 'next' }` object.

This function returns a promise which is fulfilled when the location actually
changes.

```javascript
player.seek(15).then(() => {
  console.log(`current time: ${player.getCurrentTime()}`);
});
```

### `addEventListener(eventName, handler)`

Adds event listener, binding handler's `this` to the player object.

#### `play` event

`play` event is dispatched when playback is _initiated_, either by clicking play
button or calling `player.play()` method, but _not yet started_.

```javascript
player.addEventListener('play', () => {
  console.log('play!');
})
```

#### `playing` event

`playing` event is dispatched when playback actually starts or resumes from
pause.

```javascript
player.addEventListener('playing', () => {
  console.log(`playing! we're at: ${this.getCurrentTime()}`);
})
```

#### `pause` event

`pause` event is dispatched when playback is paused.

```javascript
player.addEventListener('pause', () => {
  console.log("paused!");
})
```

#### `ended` event

`ended` event is dispatched when playback stops after reaching the end of
the recording.

```javascript
player.addEventListener('ended', () => {
  console.log("ended!");
})
```

#### `input` event

`input` event is dispatched for every keyboard input that was recorded.

Callback's 1st argument is an object with `data` field, which contains
registered input value. Usually this is ASCII character representing a key, but
may be a control character, like `"\r"` (enter), `"\u0001"` (ctrl-a), `"\u0003"`
(ctrl-c), etc. See [input events in asciicast file
format](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md#supported-event-types)
for more information.

This event can be used to play keyboard typing sound or display key presses on
the screen amongst other use cases.

```javascript
player.addEventListener('input', ({data}) => {
  console.log('input!', JSON.stringify(data));
})
```

`inputOffset` source option can be used to shift fired input events in time,
e.g. when you need them to fire earlier due to audio latency etc:

```javascript
const player = AsciinemaPlayer.create({
  url: '/demo.cast',
  inputOffset: -1.0
}, document.getElementById('demo'));

player.addEventListener('input', ({data}) => {
  // this is now fired 1 sec ahead of original key press time
  playSound(data);
})
```

Note: `input` events are dispatched only for asciicasts recorded with `--stdin`
option, e.g. `asciinema rec --stdin demo.cast`.

#### `marker` event

`marker` event is dispatched for every [marker](#markers-1) encountered during
playback.

Callback's 1st argument is an object with `index`, `time` and `label` fields,
which represent marker's index (0-based), time and label respectively.

The following example shows how to implement looping over a section of a
recording with combination of `marker` event and [`seek` method](#seeklocation):

```javascript
player.addEventListener('marker', ({ index, time, label }) => {
  console.log(`marker! ${index} - ${time} - ${label}`);

  if (index == 3) {
    player.seek({ marker: 2 });
  }
})
```

### `dispose()`

Use this function to dispose of the player, i.e. to shut it down, release all
resources and remove it from DOM.

## Fonts

By default the player uses a web safe, platform specific monospace font via
`font-family` value like this: `"Consolas, Menlo, 'Bitstream Vera Sans Mono',
monospace"`.

You can use any custom monospace font with the player by adding `@font-face`
definitions in CSS and calling `AsciinemaPlayer.create` with
`terminalFontFamily` option. Regular font face is necessary, bold (weight 700)
is recommended, italic is optional (italics are rarely used in terminal).

If you use [icons](https://fontawesome.com/) or
[other](https://github.com/powerline/powerline)
[symbols](https://github.com/romkatv/powerlevel10k) in your shell you may want
to use one of [Nerd Fonts](https://www.nerdfonts.com/).

For example to use [Fira Code](https://github.com/tonsky/FiraCode) Nerd Font try
this:

```css
/* app.css */

@font-face {
    font-family: "FiraCode Nerd Font";
    src:    local(Fira Code Bold Nerd Font Complete Mono),
            url("/fonts/Fira Code Bold Nerd Font Complete Mono.ttf") format("truetype");
    font-stretch: normal;
    font-style: normal;
    font-weight: 700;
}

@font-face {
    font-family: "FiraCode Nerd Font";
    src:    local(Fira Code Regular Nerd Font Complete Mono),
            url("/fonts/Fira Code Regular Nerd Font Complete Mono.ttf") format("truetype");
    font-stretch: normal;
}

```

```javascript
// app.js

AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
  terminalFontFamily: "'FiraCode Nerd Font', monospace"
});
```

Note that the player performs measurement of font metrics (width/height) when it
mounts on the page, therefore it's highly recommended to ensure chosen font is
already loaded before calling `create`. This can be achieved by using [CSS Font
Loading API](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load):

```javascript
document.fonts.load("1em FiraCode Nerd Font").then(() => {
  AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
    terminalFontFamily: "'FiraCode Nerd Font', monospace"
  });
}
```

## Markers

Markers are specific points in recording's timeline, which can be used for
navigation within the recording or automation of the player.

There are several ways of specifying markers for use in the player:

- using [`markers` option](#markers) with `AsciinemaPlayer.create`,
- embedding markers in the recording - see [asciinema recorder doc on
  markers](https://github.com/asciinema/asciinema#markers).

See also [`marker` event](#marker-event).

## Keyboard shortcuts

The following keyboard shortcuts are currently available (when the player
element is focused):

* <kbd>space</kbd> - play / pause
* <kbd>f</kbd> - toggle fullscreen mode
* <kbd>←</kbd> / <kbd>→</kbd> - rewind by 5 seconds / fast-forward by 5 seconds
* <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>Shift</kbd> + <kbd>→</kbd> - rewind by 10% / fast-forward by 10%
* <kbd>[</kbd> - rewind to the previous [marker](#markers-1)
* <kbd>]</kbd> - fast-forward to the next [marker](#markers-1)
* <kbd>0</kbd>, <kbd>1</kbd>, <kbd>2</kbd> ... <kbd>9</kbd> - jump to 0%, 10%, 20% ... 90%
* <kbd>.</kbd> - step through a recording a frame at a time (when paused)

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

## Sponsors

asciinema is sponsored by:

- [Brightbox](https://www.brightbox.com/)

## Consulting

I offer consulting services for asciinema project. See https://asciinema.org/consulting for more information.

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors).

## License

© 2011 Marcin Kulik.

All code is licensed under the Apache License, Version 2.0. See LICENSE file for details.
