import { Terminal } from "@xterm/xterm";
import { ImageAddon } from "@xterm/addon-image";

// Third reference backend for asciinema-player's experimental `terminalBackend`
// hook. xterm.js is the de-facto web terminal (VS Code et al.); hooking it in
// shows the API is engine-agnostic. Kept outside the player bundle: a pinned,
// replaceable PoC.

const paletteNames = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
];

function themeOf(appearance) {
  const t = appearance.theme;
  const theme = { foreground: t.foreground, background: t.background, cursor: t.foreground };
  paletteNames.forEach((name, i) => { theme[name] = t.palette[i]; });
  return theme;
}

export function xtermBackend() {
  return async ({ element, size, appearance }) => {
    const term = new Terminal({
      cols: size.cols,
      rows: size.rows,
      fontFamily: appearance.fontFamily,
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      theme: themeOf(appearance),
      cursorBlink: appearance.cursorMode === "blinking" && appearance.blinking,
      disableStdin: true,
      scrollback: 0,
      convertEol: false,
    });
    term.open(element);
    term.loadAddon(new ImageAddon()); // Sixel + iTerm2 (OSC 1337) inline images
    element.style.display = "grid"; // center the scaled grid in the player's box

    // xterm measures its own cell metrics, so its grid rarely matches asciinema's
    // viewport exactly. Uniformly scale it to fit the player's box (no glyph
    // distortion, no clipping) instead of letting taller rows overflow.
    const root = term.element;
    function fit() {
      if (!root || !root.offsetWidth || !root.offsetHeight) return;
      root.style.transform = "";
      const k = Math.min(element.clientWidth / root.offsetWidth, element.clientHeight / root.offsetHeight);
      root.style.transformOrigin = "center";
      root.style.transform = `scale(${k})`;
    }
    fit();
    return {
      write(data) { term.write(data, fit); },
      resize({ cols, rows }) { term.resize(cols, rows); fit(); },
      reset({ size, init }) {
        term.reset(); // full reset: clears screen, scrollback and attributes
        term.resize(size.cols, size.rows);
        if (init) term.write(init);
        fit();
      },
      update(next) {
        const o = term.options;
        o.theme = themeOf(next);
        o.fontFamily = next.fontFamily;
        o.fontSize = next.fontSize;
        o.lineHeight = next.lineHeight;
        o.cursorBlink = next.cursorMode === "blinking" && next.blinking;
        fit();
      },
      // xterm renders on its own animation frame after write().
      present() {},
      dispose() { term.dispose(); },
    };
  };
}
