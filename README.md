# asciinema player

[![Build Status](https://travis-ci.org/asciinema/asciinema-player.svg?branch=master)](https://travis-ci.org/asciinema/asciinema-player)

Terminal session player, used on asciinema.org.

## Keyboard shortcuts

* `space` - play / pause
* `f` - toggle fullscreen mode
* `←` / `→` - rewind 5 seconds / fast-forward 5 seconds
* `0, 1, 2 ... 9` - jump to 0%, 10%, 20% ... 90%
* `<` / `>` - decrease / increase playback speed

## Development

The project uses [leiningen](http://leiningen.org/) for development and build
related tasks so make sure you have it installed (as well as Java 7 or 8).

TODO: clarify this all

    lein figwheel dev
    lein less auto
    lein cljsbuild auto test

Open [localhost:3449](http://localhost:3449/) in the browser to load the player
with sample asciicast.

Any changes made to `.cljs` or `.less` files will be automatically pushed to the
browser, preserving player's state.

### Building

To build Javascript and CSS bundles run:

    lein cljsbuild once release
    lein less once

## Usage

TODO: update this section to reflect new namespace

Add player script and stylesheet to the page:

```html
<head>
  <link rel="stylesheet" type="text/css" href="/asciinema-player.css" />
  <script src="/asciinema-player.js"></script>
</head>
```

Insert the player with:

```javascript
asciinema_player.core.CreatePlayer(parent, width, height, dataURL, duration, options)
```

where:

* `parent` - DOM element into which the player should be inserted as a child,
* `width` - width of the player (number of terminal columns),
* `height` - height of the player (number of terminal lines),
* `dataURL` - URL of the data file which contains animation frames (also see note below),
* `duration` - total duration of the recording in seconds,
* `options` - (optional) object with any of the following properties:
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
  asciinema_player.core.CreatePlayer(
    document.getElementById('player-container')
    80,
    24,
    '/frames.json',
    123.0,
    { speed: 2 }
  );
</script>
```

### Note on `dataURL`

The player doesn't directly support [asciicast v1
format](https://github.com/asciinema/asciinema/blob/master/doc/asciicast-v1.md).
It's rather dumb at the moment. asciinema.org does heavy lifting and converts
v1 format JSON into a simple format (series of line diffs) understandable by
the player.

To obtain proper JSON file that can be used as `dataURL` argument you can either:

* download it from asciinema.org (look it up in specific recording's HTML page
  source: https://asciinema.org/a/190),
* convert asciicast v1 format (as produced by `asciinema rec file.json`) with
  [this script](https://gist.github.com/sickill/504474702dd18c7dc0ec).

## TODO

* update player to directly support asciicast v1 format
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
