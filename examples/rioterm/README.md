# Optional rioterm terminal — experimental proof of concept

A fourth reference backend for asciinema-player's experimental `terminalBackend`
hook, alongside `../ghostty-web`, `../wterm` and `../xterm`. rioterm is
[Rio](https://github.com/raphamorim/rio)'s Rust terminal core (**librio**)
compiled to WASM — a different engine again — and it ships two interchangeable
renderers (canvas and DOM). This example uses the **DOM renderer**. The default
player does not import or depend on rioterm. It pins `rioterm` 0.1.8.

**Canvas renderer status:** `riotermBackend({ renderer: "canvas" })` works and
renders, but fitting/centering it into asciinema's viewport is **currently
broken** and not shown in the comparison. rioterm owns the canvas element's
size/position and only repaints on write, so scaling it to the player's box
either leaves it off-center or clears it to black once playback pauses. A proper
fix needs rioterm to expose a re-render/refresh hook. The DOM renderer has none
of these issues.

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
http://localhost:8077/examples/?backends=default,rioterm and select **Play all**.
The players read the same local `unicode.cast`: the default terminal and
rioterm's DOM renderer. (The canvas renderer is available as
`?backends=rioterm-canvas` but its viewport fit is broken; see below.)

## The adapter

```js
import { create } from "asciinema-player";
import { riotermBackend } from "./dist/backend.js";

// DOM renderer (default)
create("demo.cast", container, { terminalBackend: riotermBackend() });
// canvas renderer (works, but viewport fit/centering is currently broken)
create("demo.cast", other, { terminalBackend: riotermBackend({ renderer: "canvas" }) });
```

See `../ghostty-web/README.md` for the full `terminalBackend` contract. It maps
onto rioterm as:

* `write` → `Terminal.write`.
* `resize` → `Terminal.resize` (`fit: false`; the player owns cols/rows).
* `reset` → `Terminal.write("\x1bc")` (RIS discards screen, scrollback and
  attributes — rioterm has no `reset()` method) then `resize` and the init string.
* `update` → re-fit; theme and font are set at `open()`.
* `present` → no-op; the renderer repaints snapshots on its own animation frame.
* `dispose` → the `open()` handle's `dispose`.

librio's WASM is served separately (resolved via `import.meta.url`), so the build
copies it to `dist/librio_wasm_bg.wasm` and the adapter points `initWasm` at it.

## Geometry

Like xterm.js, rioterm measures its own cell metrics, so its grid rarely matches
asciinema's viewport exactly. The adapter uniformly scales the renderer's mount
element to fit the player's box (centered, no distortion, no clipping).

## Known limitations

* Pinned to `rioterm` 0.1.8 (early release); this is an experimental hook, not a
  stable ABI.
* Theme and font are applied at `open()`; runtime theme/font changes are not
  wired up (the adapter only re-fits the scale).
* Adaptive palettes, bold-as-bright, blinking and hidden cursor are not wired up.
* No terminal graphics protocol.
* Like the other examples, `seek()` does not guarantee paint completion.
* This is an opt-in comparison, not a proposed replacement for avt. No
  performance claim; GIF export is not included.

The lifecycle tests in `tests/terminal-backend.spec.js` do not need this example
installed.
