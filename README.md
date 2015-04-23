# asciinema player

This is the player used on asciinema.org.

## Building

To build run:

    $ node_modules/.bin/grunt

## Usage

Add player script, it's dependencies and stylesheets to the page:

```html
<head>
  <link rel="stylesheet" type="text/css" href="/dist/css/asciinema-player.css" />
  <link rel="stylesheet" type="text/css" href="/dist/css/themes/tango.css" />
  <link rel="stylesheet" type="text/css" href="/dist/css/themes/solarized-dark.css" />
  <link rel="stylesheet" type="text/css" href="/dist/css/themes/solarized-light.css" />

  <script src="http://fb.me/react-0.10.0.js"></script>
  <script src="http://fb.me/JSXTransformer-0.10.0.js"></script>
  <script src="http://code.jquery.com/jquery-1.10.0.min.js"></script>
  <script src="/src/scripts/vendor/screenfull.js"></script>
  <script src="/dist/js/asciinema-player.js"></script>
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
* `dataUrl` - URL of the data file which contains animation frames,
* `duration` - total duration of the recording,
* `options` - (optional) object with any of the following properties:
  * `speed` - playback speed, default: 1,
  * `snapshot` - snapshot (preview) to display, default: [],
  * `autoPlay` - set to true if playback should start automatically, default: false,
  * `loop` - set to true if playback should be looped, default: false,
  * `fontSize` - size of terminal font: `'small'`, `'medium'` or `'big'`; default: `'small'`,
  * `theme` - terminal theme: `'tango'`, `'solarized-dark'` or `'solarized-light'`; default: `'tango'`

For example:

```html
<div id="player-container"></div>
<script>
  asciinema.CreatePlayer(document.getElementById('player-container'), 80, 24, '/frames.json', 123.0, { speed: 2 })
</script>
```

## Contributing

If you want to contribute to this project check out
[Contributing](https://asciinema.org/contributing) page.

## Authors

Developed with passion by [Marcin Kulik](http://ku1ik.com) and great open
source [contributors](https://github.com/asciinema/asciinema-player/contributors)

## License

Copyright &copy; 2011-2015 Marcin Kulik.
