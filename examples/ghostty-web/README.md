# Optional Ghostty terminal — experimental proof of concept

This example keeps asciinema's recording parser, playback clock and controls,
but opts into ghostty-web's WASM terminal and Canvas renderer. The default
player does not import or depend on ghostty-web. The example pins version 0.4.0.

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
http://localhost:8077/examples/?backends=default,ghostty-web and select
**Play all** (or tick/untick backends in the picker).
The two players read the same local `unicode.cast`, including clusters split
across output events. No shell, PTY, external service or live process is needed.

## Experimental backend hook

```js
import { create } from "asciinema-player";
import { ghosttyBackend } from "./dist/backend.js";

create("demo.cast", container, { terminalBackend: ghosttyBackend() });
```

`terminalBackend(context)` receives an owned DOM element, initial dimensions
and appearance. It can return a promise; playback waits until it is ready.
The factory must clean up resources itself if it rejects. If it resolves after
the player is disposed, its returned backend is disposed immediately.

The returned object implements:

* `write(string)`: feed unmodified VT output; retain parser state between calls.
* `resize({cols, rows})`: apply the recording's terminal dimensions.
* `reset({size, init, theme})`: discard all VT state, restore dimensions and feed
  the optional initialization string. This is essential for seek and loop.
* `update(appearance)`: apply resolved theme, font, cursor and display settings.
* `present()`: render pending changes; may return a promise. Calls are coalesced
  and never overlap, but stream mutations may arrive during an async present.
* `dispose()`: release listeners, timers, DOM and emulator resources.

Mutations must be synchronous. Playback already batches output during seeks;
the adapter receives each string in order, with resizes interleaved correctly.
There is no per-character or per-escape-sequence callback. The player controls
the outer viewport using its existing cell metrics; a backend must fit that
viewport. The factory runs in the UI thread even with the split worker build.

The option is experimental, not a stable plugin ABI. The current `seek()`
promise does not promise completion of painting (the default renderer also
paints on the next animation frame). A public export/flush API is outside this
proof of concept.

## Known limitations

* **One instance per page.** ghostty-web 0.4.0 crashes with "memory access out of
  bounds" when several players initialize concurrently on the same page. The WASM
  module is loaded once and shared, but the library still can't run multiple
  terminals reliably. For multi-player pages use the `wterm`, `xterm` or `rioterm`
  backends instead. (The comparison launcher only shows a single ghostty-web panel.)
* This uses Ghostty's VT plus **browser Canvas text rendering**, not Ghostty's
  native font renderer. Fonts and browser shaping affect results; cross-cell
  shaping and universal Unicode correctness are not claimed.
* Canvas is fitted into asciinema's existing geometry. This can stretch glyphs
  when the two renderers disagree on cell metrics or line height.
* The adapter uses exposed renderer/WASM objects to force presentation because
  ghostty-web 0.4.0 has no public flush method. This belongs in this pinned
  example, not in the player contract.
* Adaptive palettes, bold-as-bright, hidden cursor and full graphics-protocol
  compatibility are not yet implemented by this example.
* This is an opt-in comparison, not a proposed replacement for avt, and makes
  no performance claim. GIF export is not included.

The lifecycle tests in `tests/terminal-backend.spec.js` do not need this example
installed.
