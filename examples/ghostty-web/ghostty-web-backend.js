import { Ghostty, Terminal } from "ghostty-web";

const paletteNames = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
];

// Kept outside the player bundle: this is a pinned, independently replaceable PoC.
// The ghostty-web WASM module is loaded once and shared across all terminals
// (each `new Terminal({ghostty})` is a separate terminal). Loading it per player
// crashes with "memory access out of bounds" when several init concurrently.
let loaded;

export function ghosttyBackend({ wasmUrl = new URL("./ghostty-vt.wasm", import.meta.url).href } = {}) {
  return async ({ element, size, appearance }) => {
    const ghostty = await (loaded ??= Ghostty.load(wasmUrl));
    await document.fonts.ready;
    let current = appearance;
    let terminal;
    function theme() {
      const result = { foreground: current.theme.foreground, background: current.theme.background };
      paletteNames.forEach((name, i) => { result[name] = current.theme.palette[i]; });
      return result;
    }
    function fitCanvas() {
      // The player owns viewport width. Match it, but scale height uniformly
      // (height:auto) instead of stretching to the box's taller line-height,
      // so glyphs keep ghostty's natural aspect instead of being distorted.
      const canvas = terminal.renderer.getCanvas();
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.display = "block";
    }
    function mount(dimensions) {
      terminal = new Terminal({
        ghostty, ...dimensions, disableStdin: true, scrollback: 0,
        fontFamily: current.fontFamily, fontSize: current.fontSize, theme: theme(),
        cursorBlink: current.cursorMode === "blinking" && current.blinking,
      });
      const focused = document.activeElement;
      terminal.open(element);
      terminal.blur();
      focused?.focus?.();
      Object.assign(terminal.element.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
      fitCanvas();
    }
    function update(next) {
      current = next;
      if (terminal.options.fontFamily !== next.fontFamily) terminal.options.fontFamily = next.fontFamily;
      if (terminal.options.fontSize !== next.fontSize) terminal.options.fontSize = next.fontSize;
      terminal.options.cursorBlink = next.cursorMode === "blinking" && next.blinking;
      fitCanvas();
    }

    mount(size);
    update(appearance);
    return {
      // 0.4.0 attempts a zero-length WASM allocation for empty writes.
      write(data) { if (data.length) terminal.write(data); },
      resize({ cols, rows }) { terminal.resize(cols, rows); fitCanvas(); },
      reset({ size, init }) {
        // Recreate to reset all state and apply embedded default colors: runtime
        // theme changes are not fully supported by ghostty-web 0.4.0.
        terminal.dispose();
        mount(size);
        if (init) terminal.write(init);
      },
      update,
      present() {
        // ghostty-web 0.4 exposes these objects but has no public flush method.
        // Keeping this version-specific bridge in the example avoids baking it
        // into asciinema's API. No screenshot/rAF timing guess is necessary.
        terminal.renderer.render(terminal.wasmTerm, true, 0, terminal);
      },
      dispose() { terminal.dispose(); },
    };
  };
}
