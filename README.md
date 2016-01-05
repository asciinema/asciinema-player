# asciinema player

[![Build Status](https://travis-ci.org/asciinema/asciinema-player.svg?branch=master)](https://travis-ci.org/asciinema/asciinema-player)

Web player for terminal session recordings (as produced by [asciinema recorder](https://github.com/asciinema/asciinema)).

## Usage

### Obtain terminal session recording

You can either:

* record terminal session to a local file with `asciinema rec demo.json`
  ([more details on recording](https://github.com/asciinema/asciinema)),
* download an existing recording from asciinema.org by appending `.json` to the
  asciicast page URL (for example: https://asciinema.org/a/28307.json).

### Download the player

Download latest version of the player from
[releases page](https://github.com/asciinema/asciinema-player/releases). You
only need `asciinema-player.js` and `asciinema-player.css` files.

### Use the player in your HTML page

Add player files (`.js` and `.css`) together with the recording `.json` file to
your site assets, then initialize the player as seen on the example below:

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
  * `startAt` - start playback at given second (implies `autoPlay: true` unless
    `autoPlay: false` is set explicitly)
  * `speed` - playback speed, default: 1,
  * `snapshot` - snapshot (preview) to display, default: `[]`,
  * `fontSize` - size of terminal font: `'small'`, `'medium'` or `'big'`; default: `'small'`,
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

### Building

To build stand-alone `.js` and `.css` files run:

    lein cljsbuild once release
    lein less once

## TODO

* make `CreatePlayer` return "control object"
* add hooks (start/pause/resume/finish)
* figure out if GPL is compatible with Clojure(Script)'s EPL

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors)

## License

Copyright &copy; 2011-2015 Marcin Kulik.

All code is licensed under the GPL, v3 or later. See LICENSE file for details.
