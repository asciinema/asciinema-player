# asciinema player

This is the player used on asciinema.org.

## Development

The project uses [leiningen](http://leiningen.org/) for development and build
related tasks so make sure you have it installed.

TODO: clarify this all

    lein figwheel
    lein less auto
    lein cljsbuild auto test

## Building

To build Javascript and CSS bundles run:

    lein cljsbuild once
    lein less once

## Usage

TODO: update this section to reflect new namespace

Add player script, it's dependencies and stylesheets to the page:

```html
<head>
  <link rel="stylesheet" type="text/css" href="/asciinema-player.css" />
  <script src="/asciinema-player.js"></script>
</head>
```

Insert the player with:

```javascript
asciinema.CreatePlayer(parent, width, height, dataUrl, duration, options)
```

where:

* `parent` - DOM element into which the player should be inserted as a child,
* `width` - width of the player (number of terminal columns),
* `height` - height of the player (number of terminal lines),
* `dataUrl` - URL of the data file which contains animation frames (also see note below),
* `duration` - total duration of the recording in seconds,
* `options` - (optional) object with any of the following properties:
  * `speed` - playback speed, default: 1,
  * `snapshot` - snapshot (preview) to display, default: `[]`,
  * `autoPlay` - set to true if playback should start automatically, default: `false`,
  * `loop` - set to true if playback should be looped, default: `false`,
  * `fontSize` - size of terminal font: `'small'`, `'medium'` or `'big'`; default: `'small'`,
  * `theme` - terminal theme: `'tango'`, `'solarized-dark'` or `'solarized-light'`; default: `'tango'`

For example:

```html
<div id="player-container"></div>
<script>
  asciinema.CreatePlayer(document.getElementById('player-container'), 80, 24, '/frames.json', 123.0, { speed: 2 })
</script>
```

### Note on `dataUrl`

The player doesn't directly support [asciicast v1
format](https://github.com/asciinema/asciinema/blob/master/doc/asciicast-v1.md).
It's rather dumb at the moment. asciinema.org does heavy lifting and converts
v1 format JSON into a simple format (series of line diffs) understandable by
the player.

To obtain proper JSON file that can be used as `dataUrl` argument you can either:

* download it from asciinema.org (look it up in specific recording's HTML page
  source: https://asciinema.org/a/190),
* convert asciicast v1 format (as produced by `asciinema rec file.json`) with
  [this script](https://gist.github.com/sickill/504474702dd18c7dc0ec).

## TODO

* update player to directly support asciicast v1 format
* add hooks (start/pause/resume/finish)

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors)

## License

Copyright &copy; 2011-2015 Marcin Kulik.
