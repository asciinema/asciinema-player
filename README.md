_Note: This is README for `development` branch. [See the version for latest stable release](https://github.com/asciinema/asciinema-player/blob/master/README.md)._

# asciinema player

[![Build Status](https://travis-ci.org/asciinema/asciinema-player.svg?branch=develop)](https://travis-ci.org/asciinema/asciinema-player)

Web player for terminal session recordings (as produced
by [asciinema recorder](https://github.com/asciinema/asciinema)) that you can
use on your website by simply adding `<asciinema-player>` tag.

## About

asciinema player is an open-source terminal session player written in
ClojureScript. Contrary to other _video_ players asciinema player doesn't play
heavy-weight video files (`.mp4`, `.webm` etc) but instead it plays light-weight
terminal session files called
[asciicasts](https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md).

Asciicast is a capture of terminal's raw output, which has to be interpreted
during the playback, so the player comes with its own interpreter based on [Paul
Williams' parser for ANSI-compatible video
terminals](http://vt100.net/emu/dec_ansi_parser). Its output is fully compatible
with most widely used terminal emulators like xterm, Gnome Terminal, iTerm etc.

You can see the player in action on [asciinema.org](https://asciinema.org).

If you don't want to depend on asciinema.org and you prefer to host the player
and the recordings yourself then read on, it's very simple.

## Features

* HTML5 [`<asciinema-player>` element](#use-the-player-in-your-html-page) you can use in your website's markup,
* copy-paste of terminal content (it's just a text after all!),
* [idle time optimization](#idle-time-limit),
* [predefined and custom font sizes](#font-size),
* [custom poster](#poster),
* [custom playback speeds](#speed),
* [looped playback](#loop),
* [starting playback at specific time](#start-at),
* [programmatic control via methods/events/properties on the HTML element](#controlling-the-player-programmatically),
* [keyboard shortcuts](#keyboard-shortcuts),
* [multiple color schemes for standard 16 colors](#theme),
* 256 color palette / 24-bit true color (ISO-8613-3),
* full-screen mode.

## Self-hosting quick start

The following example shows how to use asciinema player on your own website,
without depending on asciinema.org.

It assumes you have obtained terminal session recording file by either:

* recording terminal session to a local file with `asciinema rec demo.cast`
  ([more details on recording](https://github.com/asciinema/asciinema)),
* downloading an existing recording from asciinema.org by appending `.cast` to the
  asciicast page URL (for example: https://asciinema.org/a/28307.cast).

### Download the player

Download latest version of the player from
[releases page](https://github.com/asciinema/asciinema-player/releases). You
only need `asciinema-player.js` and `asciinema-player.css` files.

### Use the player in your HTML page

First, add `asciinema-player.js`, `asciinema-player.css`and the `.cast` file
with your recording to your site's assets.

Then add necessary includes to your HTML document:

```html
<html>
<head>
  ...
  <link rel="stylesheet" type="text/css" href="/asciinema-player.css" />
  ...
</head>
<body>
  ...
  <asciinema-player src="/demo.cast"></asciinema-player>
  ...
  <script src="/asciinema-player.js"></script>
</body>
</html>
```

## `<asciinema-player>` element attributes

### `cols`

Number of columns of player's terminal.

When not set it defaults to 80 (until asciicast gets loaded) and to terminal
width saved in the asciicast file (after it gets loaded).

It's recommended to set it to the same value as in asciicast file to prevent
player to resize itself from 80x24 to the actual dimensions of the asciicast
when it gets loaded.

### `rows`

Number of lines of player's terminal.

When not set it defaults to 24 (until asciicast gets loaded) and to terminal
height saved in the asciicast file (after it gets loaded).

Same recommendation as for `cols` applies here.

### `autoplay`

Set this attribute to any value if playback should start automatically. Defaults
to no autoplay.

### `preload`

Set this attribute to any value if the recording should be preloaded on player's
initialization. Defaults to no preload.

### `loop`

Set this attribute to any value if playback should be looped. Defaults to no
looping.

### `start-at`

Start playback at given time.

Supported formats:

* 123 (number of seconds)
* 2:03 ("mm:ss")
* 1:02:03 ("hh:mm:ss")

Defaults to 0.

### `speed`

Playback speed. Defaults to 1 (normal speed). 2 means 2x faster.

### `idle-time-limit`

Limit terminal inactivity to given number of seconds.

For example, when set to `2` any inactivity longer than 2 seconds will be
"compressed" to 2 seconds.

Defaults to:

- `idle_time_limit` from asciicast header (saved when passing `-i <sec>` to
  `asciinema rec`),
- no limit, when it was not specified at the time of recording.

### `poster`

Poster (preview) to display before playback start.

The following poster specifications are supported:

* `npt:2:34` - show recording "frame" at given time
* `data:text/plain,Poster text` - show given text

The easiest way of specifying a poster is to use `npt:2:34` format. This will
preload the recording and display terminal contents from the recording at 2 min
34 s.

Example:

```html
<asciinema-player src="..." poster="npt:2:34"></asciinema-player>
```

Alternatively, a `poster` value of `data:text/plain,This will be printed as
poster\n\rThis in second line` will display arbitrary text. All [ANSI escape
codes](https://en.wikipedia.org/wiki/ANSI_escape_code) can be used to add color
and move the cursor around to produce good looking poster.

Example of using text poster with cursor positioning:

```html
<asciinema-player src="..." poster="data:text/plain,I'm regular \x1b[1;32mI'm bold green\x1b[3BI'm 3 lines down"></asciinema-player>
```

Defaults to screen contents at `start-at` (or blank terminal when `start-at` is
0).

### `font-size`

Size of the terminal font.

Possible values:

* `small`
* `medium`
* `big`
* any CSS `font-size` value (e.g. `15px`)

Defaults to `small`.

### `theme`

Terminal color theme.

One of:

* `asciinema`
* `tango`
* `solarized-dark`
* `solarized-light`
* `monokai`

Defaults to `asciinema`.

You can also [use a custom theme](https://github.com/asciinema/asciinema-player/wiki/Custom-terminal-themes).

### `title`

Title of the asciicast, displayed in the titlebar in fullscreen mode.

### `author`

Author of the asciicast, displayed in the titlebar in fullscreen mode.

### `author-url`

URL of the author's homepage/profile. Author name (`author` above) is linked to
this URL.

### `author-img-url`

URL of the author's image, displayed in the titlebar in fullscreen mode.

### Example usage with options

```html
<asciinema-player src="/demo.cast" speed="2" theme="solarized-dark" loop="loop" poster="data:text/plain,\u001b[5;5HAwesome \u001b[1;33mdemo!"></asciinema-player>
```

## Controlling the player programmatically

The player's DOM element provides several properties, methods and events
mimicking
[HTMLVideoElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement),
allowing for programmatical control over the player.

### Properties

#### duration

`duration` property gives the length of the recording in seconds, or zero if no
recording data is available (for ex. before `loadedmetadata` event is
triggered).

```javascript
document.getElementById('player').duration; // 123.45
```

#### currentTime

`currentTime` property gives the current playback time in seconds. Setting this
value seeks the recording to the new time.

```javascript
document.getElementById('player').currentTime; // 1.23
document.getElementById('player').currentTime = 33;
```

### Methods

#### play

`play` method attempts to begin playback of the recording. If the recording
hasn't been preloaded then it tries to load it, and then starts the playback.

```javascript
document.getElementById('player').play();
```

NOTE: If you want to synchronize asciinema player's playback with other elements
on the page (for example `<audio>` element) then you should wait for the `play`
event to occur, which signifies actual start of the playback.

#### pause

`pause` method pauses playback.

```javascript
document.getElementById('player').pause();
```

### Events

#### loadedmetadata, loadeddata, canplay, canplaythrough

The `loadedmetadata`, `loadeddata`, `canplay` and `canplaythrough` events are
fired (all of them, in this order) when the recording has been loaded and is
ready to play. The recordings are always fully fetched (you can't partially load
resource with XHR) so there's no difference in the amount of metadata/data
available between these 4 events - when either event occurs the player already
has all the information for smooth playback. In other words, it's enough to
listen to only one of them, e.g. `canplaythrough` (all 4 are supported to make
it more in line with HTMLVideoElement).

```javascript
document.getElementById('player').addEventListener('loadedmetadata', function(e) {
  console.log("duration is", this.duration);
}

document.getElementById('player').addEventListener('canplaythrough', function(e) {
  console.log("all ready to play");
}
```

NOTE: The player starts fetching the recording either when `preload` attribute
is set (in this case these events may not be immediately followed by `play`
event), or when user starts the playback (in this case these events are
immediately followed by `play` event).

#### play

The `play` event is fired when playback has begun.

```javascript
document.getElementById('player').addEventListener('play', function(e) {
  console.log("it's playing");
  console.log("we're at", this.currentTime);
}
```

#### pause

The `pause` event is fired when playback has been paused.

```javascript
document.getElementById('player').addEventListener('pause', function(e) {
  console.log("it's paused");
}
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

Clone this repository:

    git clone https://github.com/asciinema/asciinema-player
    cd asciinema-player

Make sure git submodules are fetched and up to date:

    git submodule update --init --recursive

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

To build stand-alone `.js` and `.css` files clone repository, initialize git
submodules (as shown above), then run:

    lein cljsbuild once release
    lein less once

This produces `resources/public/js/asciinema-player.js` and `resources/public/css/asciinema-player.css`.

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors).

## License

Copyright &copy; 2011-2017 Marcin Kulik.

All code is licensed under the Apache License, Version 2.0. See LICENSE file for details.
