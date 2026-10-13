# asciinema-player examples — pluggable terminal backends

These examples demonstrate the experimental `terminalBackend` option: the player
keeps its recording parser, playback clock, controls and seeking, but hands VT
output to an alternate terminal engine/renderer. One comparison launcher runs any
mix of backends side by side against the built-in `avt` terminal.

## Build and run (one go)

```sh
# from the repository root
npm ci && npm run build          # build the player itself (dist/)

cd examples
npm ci && npm run build          # install all backend deps + build every adapter

cd ..
npx serve -l 8077            # any static server from the repo root works
```

The last step just serves the repo root over HTTP so both `/examples/` and
`/dist/` are reachable — use whatever static server you have
(`npx serve -l 8077`, etc.).

Open the launcher: <http://localhost:8077/examples/>

Pick backends with the checkboxes, or via the URL:
<http://localhost:8077/examples/?backends=default,ghostty-web,wterm-ghostty>

## What's shared / extra / different

- **Shared** — the player core (`../dist`): recording parser, clock, control bar,
  seeking, theming. Unchanged; none of the backends are in the player bundle.
- **Extra** — one small adapter per backend, `<name>/<name>-backend.js`, plus that
  engine's npm package and its WASM/CSS, copied into `<name>/dist/`.
- **Different** — the VT engine and how it paints (Canvas vs DOM).

## Backends

| `?backends=` id   | engine            | lang    | renderer | notes |
|-------------------|-------------------|---------|----------|-------|
| `default`         | avt (built-in)    | Rust    | DOM/Canvas | no `terminalBackend` |
| `ghostty-web`     | libghostty        | Zig/C   | Canvas   | |
| `wterm`           | wterm built-in    | Zig     | DOM      | |
| `wterm-ghostty`   | libghostty        | Zig/C   | DOM      | renders Kitty images |
| `xterm`           | xterm.js          | TS      | DOM      | |
| `rioterm`         | librio (Rio)      | Rust    | DOM      | |
| `rioterm-canvas`  | librio (Rio)      | Rust    | Canvas   | viewport fit broken |

Each backend has its own README (contract mapping + limitations) in its folder.

## Layout

```
examples/
  index.html              comparison launcher (?backends=… + checkbox picker)
  package.json            all backend deps (one install)
  build.mjs               bundles every adapter into <name>/dist/
  gen-cast.mjs            generates unicode.cast (the recording played)
  <name>/
    <name>-backend.js     the adapter (the only hand-written code)
    README.md             contract mapping + limitations
    dist/                 built adapter + its WASM/CSS (generated)
```

The adapters are bundled into separate `<name>/dist/` folders on purpose: two
backends ship a file literally named `ghostty-vt.wasm` (ghostty-web's libghostty
build and `@wterm/ghostty`'s), so keeping them in separate folders avoids a clash.
