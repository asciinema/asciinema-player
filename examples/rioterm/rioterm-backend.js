import { open, initWasm, defaultTheme } from "rioterm";

// Fourth reference backend for asciinema-player's experimental `terminalBackend`
// hook. rioterm is Rio's Rust terminal core (librio) compiled to WASM, with a
// canvas or DOM renderer selectable per instance. Kept outside the player
// bundle: a pinned, replaceable PoC.
//
// The example uses the DOM renderer. The canvas renderer also works, but fitting
// it into asciinema's viewport is unresolved: rioterm owns the canvas element's
// size/position and only repaints on write, so our scaling either leaves it
// off-center or (if we restyle the canvas) clears it to black once paused. Until
// rioterm exposes a re-render/refresh hook, canvas is left as `renderer: "canvas"`
// for the curious but is not shown in the comparison.

const paletteNames = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
];

function themeOf(appearance) {
  const t = appearance.theme;
  const theme = {
    ...defaultTheme,
    foreground: t.foreground,
    background: t.background,
    cursor: t.foreground,
    selectionForeground: t.background,
    selectionBackground: t.foreground,
  };
  paletteNames.forEach((name, i) => { theme[name] = t.palette[i]; });
  return theme;
}

let wasmReady;

export function riotermBackend({ renderer = "dom" } = {}) {
  return async ({ element, size, appearance }) => {
    // librio's wasm is served separately (resolved via import.meta.url); point
    // initWasm at the copy in dist/ and load it once.
    await (wasmReady ??= initWasm(new URL("./librio_wasm_bg.wasm", import.meta.url)));
    const handle = await open(element, {
      renderer,
      fit: false, // the player owns cols/rows
      autoFocus: false,
      cols: size.cols,
      rows: size.rows,
      fontFamily: appearance.fontFamily,
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      theme: themeOf(appearance),
      cursorStyle: "block",
    });
    const term = handle.terminal;
    const root = handle.renderer.element;
    element.style.display = "grid";

    // rioterm measures its own cell metrics, so its grid rarely matches
    // asciinema's viewport. Uniformly scale (transform only) to fit. The DOM
    // renderer's mount is a zero-height container, so this no-ops for it and the
    // rows sit at natural size; that renders cleanly, which is what the example uses.
    function fit() {
      if (!root.offsetWidth || !root.offsetHeight) return;
      root.style.transform = "";
      const k = Math.min(element.clientWidth / root.offsetWidth, element.clientHeight / root.offsetHeight);
      root.style.transformOrigin = "center";
      root.style.transform = `scale(${k})`;
    }
    const refit = () => requestAnimationFrame(fit);
    fit();
    return {
      write(data) { term.write(data); refit(); },
      resize({ cols, rows }) { term.resize(cols, rows); refit(); },
      reset({ size, init }) {
        term.write("\x1bc"); // RIS: librio discards screen, scrollback, attributes
        term.resize(size.cols, size.rows);
        if (init) term.write(init);
        refit();
      },
      update() { fit(); }, // theme/font are set at open(); scale tracks the box
      // The renderer repaints snapshots on its own animation frame after write().
      present() {},
      dispose() { handle.dispose(); },
    };
  };
}
