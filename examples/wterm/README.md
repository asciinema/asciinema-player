# Optional wterm terminal — experimental proof of concept

A second reference backend for asciinema-player's experimental `terminalBackend`
hook, alongside `../ghostty-web`. It exists to show the hook is renderer-agnostic
and even core-agnostic:

* **ghostty-web** renders to a **Canvas** and is fitted into asciinema's geometry.
* **wterm** renders to the **DOM**. Because wterm lays out `1ch` cells and an
  em-based row height, it matches asciinema's own cell metrics directly — no
  canvas fitting, no glyph stretching.

wterm has two interchangeable VT cores, and this example drives both through one
adapter (`wtermBackend`):

* **built-in Zig core** — lightweight VT100/VT220/xterm parser compiled to a
  ~26 KB WASM core, embedded in `@wterm/dom`. Used by `wtermBackend()`.
* **libghostty core** — full VT emulation from `@wterm/ghostty`. Used by
  `wtermBackend({ ghostty: true })`.

The default player does not import or depend on wterm. This example pins
`@wterm/dom` and `@wterm/ghostty`. The Zig core's WASM is inlined into
`dist/backend.js`; the libghostty WASM is served separately as
`dist/ghostty-vt.wasm`.

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
http://localhost:8077/examples/?backends=default,wterm,wterm-ghostty and select
**Play all**. The players read the same local `unicode.cast`: the default
terminal and wterm with each core.

The recording ends with a **Kitty Graphics Protocol** image (a direct PNG sent as
a chunked `APC _G` sequence). It renders only in the **libghostty** panel — the
libghostty core implements the graphics protocol, while the built-in Zig core and
the default asciinema terminal have no image support and silently swallow the
escape, so no base64 text leaks into those panels.

## The adapter

```js
import { create } from "asciinema-player";
import { wtermBackend } from "./dist/backend.js";

// built-in Zig core
create("demo.cast", container, { terminalBackend: wtermBackend() });
// libghostty core
create("demo.cast", other, { terminalBackend: wtermBackend({ ghostty: true }) });
```

See `../ghostty-web/README.md` for the full `terminalBackend` contract. This
adapter maps it onto wterm as follows:

* `write` → `WTerm.write`.
* `resize` → `WTerm.resize` (`autoResize: false`; the player owns dimensions).
* `reset` → `WTerm.write("\x1bc")` (RIS discards screen, scrollback and
  attributes) then `resize` and the optional init string. RIS is synchronous and
  preserves stream order, so no terminal recreation is needed for seek/loop.
* `update` → theme, font and cursor via wterm's CSS custom properties
  (`--term-fg`, `--term-bg`, `--term-color-0..15`, `--term-font-*`,
  `--term-line-height`, `--term-row-height`) plus `setThemeColors` so the core's
  default/inverse colors stay in sync.
* `present` → no-op; wterm repaints dirty rows on its own animation frame.
* `dispose` → `WTerm.destroy`.

The host element's 12px wterm padding is zeroed because the player already owns
the viewport box.

## Known limitations

* Pinned to `@wterm/dom` / `@wterm/ghostty` 0.5.x; this is an experimental hook,
  not a stable ABI.
* Adaptive palettes, bold-as-bright and hidden-cursor are not wired up here.
* Kitty graphics: only the libghostty core, and only direct PNG/RGB/RGBA (no
  Sixel, iTerm2/OSC 1337, or animation). The image is a transient overlay.
* Like the ghostty example, `seek()` does not guarantee paint completion; the
  default renderer also paints on the next animation frame.
* This is an opt-in comparison, not a proposed replacement for avt. No
  performance claim; GIF export is not included.

The lifecycle tests in `tests/terminal-backend.spec.js` do not need this example
installed.
