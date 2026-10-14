import { WTerm } from "@wterm/dom";
import { GhosttyCore } from "@wterm/ghostty";

// Second reference backend for asciinema-player's experimental `terminalBackend`
// hook. Where the ghostty-web example renders to a Canvas, wterm renders to the
// DOM, driven by CSS custom properties. Because wterm lays out 1ch cells and an
// em-based row height, it matches asciinema's own cell geometry exactly with no
// canvas fitting. Kept outside the player bundle: a pinned, replaceable PoC.
//
// wterm has two interchangeable VT cores. `wtermBackend()` uses the built-in
// lightweight Zig core (embedded WASM); `wtermBackend({ ghostty: true })` uses
// the libghostty core from @wterm/ghostty (its WASM is copied into dist/).

const hex = (s) => parseInt(String(s).replace("#", ""), 16) || 0;

function applyTheme(element, term, appearance) {
  const t = appearance.theme;
  const vars = {
    "--term-font-family": appearance.fontFamily,
    "--term-font-size": `${appearance.fontSize}px`,
    "--term-line-height": `${appearance.lineHeight}`,
    // Match asciinema's row pitch so the DOM grid fills the player's viewport.
    "--term-row-height": `${appearance.lineHeight * appearance.fontSize}px`,
    "--term-fg": t.foreground,
    "--term-bg": t.background,
    "--term-cursor": t.foreground,
  };
  t.palette.forEach((c, i) => { vars[`--term-color-${i}`] = c; });
  for (const [k, v] of Object.entries(vars)) element.style.setProperty(k, v);
  // Keep the core's notion of default colors in sync (inverse/default cells).
  term?.setThemeColors({
    foreground: hex(t.foreground),
    background: hex(t.background),
    cursor: hex(t.foreground),
    palette: t.palette.map(hex),
  });
}

export function wtermBackend({ ghostty = false } = {}) {
  return async ({ element, size, appearance }) => {
    applyTheme(element, null, appearance);
    // Each terminal needs its OWN libghostty core (a GhosttyCore is a terminal with
    // its own VT state, not just the WASM module). Sharing one across players mixes
    // their content. The WASM module itself is cached internally, so per-instance
    // load() is cheap. Its WASM is served separately (not inlined).
    const core = ghostty
      ? await GhosttyCore.load({
          wasmPath: new URL("./ghostty-vt.wasm", import.meta.url).href,
        })
      : undefined;
    const term = new WTerm(element, {
      core,
      cols: size.cols,
      rows: size.rows,
      autoResize: false,
      cursorBlink: appearance.cursorMode === "blinking" && appearance.blinking,
      onData: () => {}, // playback only; drop any terminal replies
    });
    await term.init();
    element.style.padding = "0"; // the player already owns the viewport box
    applyTheme(element, term, appearance);
    return {
      write(data) { if (data.length) term.write(data); },
      resize({ cols, rows }) { term.resize(cols, rows); },
      reset({ size, init }) {
        term.write("\x1bc"); // RIS: discard screen, scrollback and attributes
        term.resize(size.cols, size.rows);
        if (init) term.write(init);
      },
      update(next) { applyTheme(element, term, next); },
      // DOM renderer repaints dirty rows on its own animation frame after write().
      present() {},
      dispose() { term.destroy(); },
    };
  };
}
