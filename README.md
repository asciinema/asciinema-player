# asciinema player

[![Build status](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml/badge.svg)](https://github.com/asciinema/asciinema-player/actions/workflows/build.yml)

__asciinema player__ is a web player for terminal sessions recordings.

Unlike typical web _video_ players, which play heavyweight video files (`.mp4`,
`.mov`), asciinema player plays lightweight terminal session recordings in the
text-based [asciicast](https://docs.asciinema.org/manual/asciicast/v2/) format
(`.cast`), such as those produced by the [asciinema
recorder](https://docs.asciinema.org/manual/cli/).

The player is built from the ground up with JavaScript and
[Rust](https://www.rust-lang.org/) ([WASM](https://webassembly.org/)), and is
available as [npm package](https://www.npmjs.com/package/asciinema-player) and a
[standalone JS
bundle](https://github.com/asciinema/asciinema-player/releases/latest).

You can use it on any HTML page - in a project documentation, on a blog, or in a
conference talk presentation.

It's as easy as adding a single line of Javascript code to your web page:

```javascript
AsciinemaPlayer.create('demo.cast', document.getElementById('demo'));
```

Check out the [quick start
guide](https://docs.asciinema.org/manual/player/quick-start/) for basic setup
overview.

You can see the player in action in [asciinema
documentation](https://docs.asciinema.org/manual/player/).

Notable features:

* ability to copy-paste terminal content - it's just text after all!
* smooth, timing-accurate playback,
* [idle time optimization](https://docs.asciinema.org/manual/player/options/#idletimelimit) to skip periods of inactivity,
* [posters](https://docs.asciinema.org/manual/player/options/#poster),
* [markers](https://docs.asciinema.org/manual/player/markers/) for navigation or auto-pause,
* configurable [font families](https://docs.asciinema.org/manual/player/fonts/) and [line height](https://docs.asciinema.org/manual/player/options/#terminallineheight),
* [automatic terminal scaling](https://docs.asciinema.org/manual/player/options/#fit) to fit into container element in most efficient way,
* full-screen mode,
* [multiple color themes for standard 16 colors](https://docs.asciinema.org/manual/player/options/#theme) + support for 256 color palette and 24-bit true color (ISO-8613-3),
* [adjustable playback speed](https://docs.asciinema.org/manual/player/options/#speed),
* [looped playback](https://docs.asciinema.org/manual/player/options/#loop), infinite or finite,
* [starting playback at specific time](https://docs.asciinema.org/manual/player/options/#startat),
* [API for programmatic control](https://docs.asciinema.org/manual/player/api/),
* [keyboard shortcuts](https://docs.asciinema.org/manual/player/shortcuts/),
* [support for other recording formats](https://docs.asciinema.org/manual/player/parsers/) like ttyrec, typescript.

## Building

Building asciinema player from source requires:

- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/),
- [Rust](https://www.rust-lang.org/) compiler (1.77 or later) and [Cargo package
  manager](https://doc.rust-lang.org/cargo/).

To build the project run:

    git clone https://github.com/asciinema/asciinema-player
    cd asciinema-player
    rustup target add wasm32-unknown-unknown
    npm install
    npm run build

This produces following output files:

- `dist/index.js` - monolithic ES module, to be `import`-ed in your JS bundle
- `dist/bundle/asciinema-player.js` - standalone monolithic player script (IIFE), to be linked directly from a website
- `dist/bundle/asciinema-player.min.js` - minimized version of the above
- `dist/bundle/asciinema-player.css` - stylesheet, to be linked directly from a website or included in a CSS bundle

The monolithic version of the player covers majority of use cases, and it's all
you need to use the player.

In addition, the split version of the player is built with `npm run build`,
producing the following files:

- `dist/ui.js` - UI ES module, to be `import`-ed in your JS bundle
- `dist/bundle/asciinema-player-ui.js` - standalone UI script (IIFE), to be linked directly from a website
- `dist/bundle/asciinema-player-ui.min.js` - minimized version of the above
- `dist/bundle/asciinema-player-worker.js` - standalone web worker script (IIFE), to be linked directly from a website
- `dist/bundle/asciinema-player-worker.min.js` - minimized version of the above

The split version runs the UI and data crunching (parsing, terminal emulation)
in separate OS threads, which improves UI's responsiveness during playback. In
this setup the UI code runs in the window context, while the processing code
runs in a
[WebWorker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API).
The benefit of this configuration is typically observed only for high
frame-rate / high bandwidth recordings only. For typical demos/sessions it's
not worth the setup hassle.

## Donations

Sustainability of asciinema development relies on donations and sponsorships.

Please help the software project you use and love. Become a
[supporter](https://docs.asciinema.org/donations/#individuals) or a [corporate
sponsor](https://docs.asciinema.org/donations/#corporate-sponsorship).

asciinema is sponsored by:

- [Brightbox](https://www.brightbox.com/)
- [DataDog](https://datadoghq.com/)

## Consulting

If you're interested in integration or customization of asciinema player to suit
your needs, check [asciinema consulting
services](https://docs.asciinema.org/consulting/).

## License

© 2011 Marcin Kulik.

All code is licensed under the Apache License, Version 2.0. See
[LICENSE](./LICENSE) file for details.
