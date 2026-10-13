# Optional xterm.js terminal — experimental proof of concept

A third reference backend for asciinema-player's experimental `terminalBackend`
hook, alongside `../ghostty-web` and `../wterm`. xterm.js is the de-facto web
terminal (VS Code, Hyper, Theia, …), so hooking it in shows the hook is engine-
agnostic. The default player does not import or depend on xterm.js. This example
pins `@xterm/xterm` 5.5.0.

From the repository root:

```sh
npm ci            # player deps
npm run build     # build the player (dist/)
cd examples
npm ci            # all backend example deps (one install)
npm run build     # build every backend adapter
cd ..
npx serve -l 8077            # or any static server from the repo root
```

Open the comparison launcher at
http://localhost:8077/examples/?backends=default,xterm and select **Play all**
(or tick/untick backends in the picker).

## The adapter

```js
import { create } from "asciinema-player";
import { xtermBackend } from "./dist/backend.js";

create("demo.cast", container, { terminalBackend: xtermBackend() });
```

See `../ghostty-web/README.md` for the full `terminalBackend` contract. It maps
onto xterm.js as:

* `write` → `Terminal.write`.
* `resize` → `Terminal.resize` (`disableStdin: true`, `scrollback: 0`; the
  player owns dimensions).
* `reset` → `Terminal.reset()` (clears screen, scrollback and attributes) then
  `resize` and the optional init string.
* `update` → `Terminal.options.{theme,fontFamily,fontSize,lineHeight,cursorBlink}`.
* `present` → no-op; xterm renders on its own animation frame after `write()`.
* `dispose` → `Terminal.dispose`.

## Geometry

xterm.js measures its own cell metrics from the font, so its grid rarely matches
asciinema's viewport exactly. The adapter uniformly scales the `.xterm` element
to fit the player's box (centered, no glyph distortion, no clipping) rather than
letting taller rows overflow. Because the scale is uniform, xterm may letterbox
slightly inside the box; this is intentional over distortion or per-font
line-height tuning.

## Known limitations

* Pinned to `@xterm/xterm` 5.5.0; this is an experimental hook, not a stable ABI.
* Adaptive palettes, bold-as-bright and hidden-cursor are not wired up here.
* No terminal graphics. xterm.js has no Kitty support; its optional
  `@xterm/addon-image` adds Sixel / iTerm inline images, not wired up here.
* Like the other examples, `seek()` does not guarantee paint completion.
* This is an opt-in comparison, not a proposed replacement for avt. No
  performance claim; GIF export is not included.

The lifecycle tests in `tests/terminal-backend.spec.js` do not need this example
installed.
