import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

export default (props) => {
  let canvasEl;
  let ctx;
  let el;
  let textEl;
  let frameRequestId;
  let blinkIntervalId;
  let cssTheme;

  const core = props.core;

  const [size, setSize] = createSignal(
    { cols: props.cols, rows: props.rows },
    { equals: (newVal, oldVal) => newVal.cols === oldVal.cols && newVal.rows === oldVal.rows },
  );

  const [theme, setTheme] = createSignal(buildTheme(FALLBACK_THEME));
  const lineHeight = () => props.lineHeight ?? 1.3333333333;
  const [cursor, setCursor] = createSignal(undefined);
  const [cursorHold, setCursorHold] = createSignal(false);
  const [blinkOn, setBlinkOn] = createSignal(true);

  const style = createMemo(() => {
    return {
      width: `${size().cols}ch`,
      height: `${lineHeight() * size().rows}em`,
      "font-size": `${(props.scale || 1.0) * 100}%`,
      "--term-line-height": `${lineHeight()}em`,
      "--term-cols": size().cols,
      "--term-rows": size().rows,
    };
  });

  const cursorCol = createMemo(() => cursor()?.[0]);
  const cursorRow = createMemo(() => cursor()?.[1]);

  let pendingChanges = {};

  onMount(() => {
    ctx = canvasEl.getContext("2d");
    if (!ctx) throw "2D ctx not available";
    const { cols, rows } = size();
    canvasEl.width = cols;
    canvasEl.height = rows;
    canvasEl.style.imageRendering = "pixelated";
    ctx.imageSmoothingEnabled = false;
    cssTheme = getCssTheme(el);
    pendingChanges.theme = props.theme ?? cssTheme;
    core.addEventListener("vtUpdate", onVtUpdate);
  });

  onCleanup(() => {
    clearInterval(blinkIntervalId);
    cancelAnimationFrame(frameRequestId);
  });

  createEffect(() => {
    if (props.blinking && blinkIntervalId === undefined) {
      blinkIntervalId = setInterval(() => {
        setBlinkOn((blink) => !blink);
      }, 600);
    } else {
      clearInterval(blinkIntervalId);
      blinkIntervalId = undefined;
      setBlinkOn(true);
    }
  });

  createEffect(() => {
    if (blinkOn()) {
      setCursorHold(false);
    }
  });

  function onVtUpdate({ size, theme, dirty }) {
    if (size !== undefined) {
      pendingChanges.size = size;
    }

    if (theme !== undefined) {
      pendingChanges.theme = theme;
    }

    if (dirty) {
      pendingChanges.dirty = true;
    }

    if (frameRequestId === undefined) {
      frameRequestId = requestAnimationFrame(applyChanges);
    }
  }

  const rowPool = [];
  const spanPool = [];

  function getNewRow() {
    let row = rowPool.pop();

    if (row === undefined) {
      row = document.createElement('span');
      row.className = 'ap-line';
    }

    return row;
  }

  function getNewSpan() {
    return spanPool.pop() ?? document.createElement('span');
  }

  function applyChanges() {
    frameRequestId = undefined;
    const { size: newSize, theme: newTheme, dirty } = pendingChanges;

    batch(function () {
      if (newSize !== undefined) {
        // resize canvas

        canvasEl.width = newSize.cols;
        canvasEl.height = newSize.rows;

        // ensure correct number of child elements

        let r = textEl.children.length;

        while (textEl.children.length < newSize.rows) {
          const row = getNewRow();
          row.style.setProperty("--row", r);
          textEl.appendChild(row);
          r += 1;
        }

        while (textEl.children.length > newSize.rows) {
          const row = textEl.lastElementChild;
          textEl.removeChild(row);
          rowPool.push(row);
        }

        setSize(newSize);
      }

      if (newTheme !== undefined) {
        if (newTheme === null) {
          setTheme(buildTheme(cssTheme));
        } else {
          setTheme(buildTheme(newTheme));
        }
        // TODO we probably should do full background repaint at this point
      }

      if (dirty) {
        const changes = core.getChanges();
        let holdCursor = false;

        if (changes.lines !== undefined) {
          const theme_ = theme();

          for (const [r, line] of changes.lines) {
            const fg = line.fg;
            const row = textEl.children[r];

            // ensure correct number of child elements

            while (row.children.length < fg.length) {
              row.appendChild(getNewSpan());
            }

            while (row.children.length > fg.length) {
              const span = row.lastElementChild;
              row.removeChild(span);
              spanPool.push(span);
            }

            let s = 0;

            for (const span of fg) {
              const el = row.children[s++];
              const style = el.style;
              const attrs = span.p;
              style.setProperty("--offset", span.x);
              style.width = `${span.w + 0.01}ch`;
              el.textContent = span.t;

              const fg = colorValue(theme_, attrs.get("fg"), attrs.get("bold"));

              if (fg) {
                style.setProperty("--fg", fg);
              } else {
                style.removeProperty("--fg");
              }

              const bg = colorValue(theme_, attrs.get("bg"));

              if (bg) {
                style.setProperty("--bg", bg);
              } else {
                style.removeProperty("--bg");
              }

              let cls = "";

              // TODO ap-cursor

              if (span.t.length == 1) {
                const cp = span.t.codePointAt(0);

                // box drawing chars, block elements and some Powerline symbols
                // are rendered with CSS classes (cp-<codepoint>)
                if ((cp >= 0x2580 && cp <= 0x259f) || (cp >= 0xe0b0 && cp <= 0xe0b3)) {
                  cls += ` cp-${cp.toString(16)}`;
                  el.textContent = " ";
                }
              }

              if (attrs.has("bold") || isBrightColor(attrs.get("fg"))) {
                cls += " ap-bright";
              }

              if (attrs.has("faint")) {
                cls += " ap-faint";
              }

              if (attrs.has("italic")) {
                cls += " ap-italic";
              }

              if (attrs.has("underline")) {
                cls += " ap-underline";
              }

              if (attrs.has("blink")) {
                cls += " ap-blink";
              }

              if (attrs.get("inverse")) {
                cls += " ap-inverse";
              }

              if (span.w == 1) {
                cls += " ap-symbol";
              }

              el.className = cls == "" ? undefined : cls;
            }

            // paint the background

            ctx.clearRect(0, r, size().cols, 1);

            for (const span of line.bg) {
              ctx.fillStyle = colorValue(theme_, span.c);
              ctx.fillRect(span.x, r, span.w, 1);
            }
          }

          holdCursor = true;
        }

        if (changes.cursor !== undefined) {
          setCursor(changes.cursor);
          holdCursor = true;
        }

        if (holdCursor) {
          setCursorHold(true);
        }
      }
    });

    pendingChanges = {};
    props.stats.renders += 1;
  }

  return (
    <div class="ap-term" style={style()} ref={el}>
      <canvas class="ap-term-bg" ref={canvasEl} />
      <pre
        class="ap-term-text"
        classList={{ "ap-cursor-on": blinkOn() || cursorHold(), "ap-blink": blinkOn() }}
        ref={textEl}
        aria-live="off"
        tabindex="0"
      ></pre>
    </div>
  );
};

function buildTheme(theme) {
  return {
    fg: theme.foreground,
    bg: theme.background,
    palette: [...theme.palette, ...FULL_PALETTE],
  };
}

function getCssTheme(el) {
  const style = getComputedStyle(el);
  const foreground = style.getPropertyValue("--term-color-foreground");
  const background = style.getPropertyValue("--term-color-background");
  const palette = [];

  for (let i = 0; i < 16; i++) {
    const c = style.getPropertyValue(`--term-color-${i}`);
    if (c === undefined) throw `--term-color-${i} has not been defined`;
    palette[i] = c;
  }

  return { foreground, background, palette };
}

function colorValue(theme, color, intense = false) {
  if (color === undefined) return;

  if (typeof color === "number") {
    if (intense && color < 8) {
      color += 8;
    }

    return theme.palette[color];
  }

  if (typeof color === "string") {
    if (color == "fg") return theme.fg;
    return color;
  }
}

function isBrightColor(color) {
  return typeof color === "number" && color >= 8 && color <= 15;
}

const FALLBACK_THEME = {
  foreground: "black",
  background: "black",
  palette: [
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
    "black",
  ],
};

// colors 16-255
const FULL_PALETTE = [
  "#000000",
  "#00005f",
  "#000087",
  "#0000af",
  "#0000d7",
  "#0000ff",
  "#005f00",
  "#005f5f",
  "#005f87",
  "#005faf",
  "#005fd7",
  "#005fff",
  "#008700",
  "#00875f",
  "#008787",
  "#0087af",
  "#0087d7",
  "#0087ff",
  "#00af00",
  "#00af5f",
  "#00af87",
  "#00afaf",
  "#00afd7",
  "#00afff",
  "#00d700",
  "#00d75f",
  "#00d787",
  "#00d7af",
  "#00d7d7",
  "#00d7ff",
  "#00ff00",
  "#00ff5f",
  "#00ff87",
  "#00ffaf",
  "#00ffd7",
  "#00ffff",
  "#5f0000",
  "#5f005f",
  "#5f0087",
  "#5f00af",
  "#5f00d7",
  "#5f00ff",
  "#5f5f00",
  "#5f5f5f",
  "#5f5f87",
  "#5f5faf",
  "#5f5fd7",
  "#5f5fff",
  "#5f8700",
  "#5f875f",
  "#5f8787",
  "#5f87af",
  "#5f87d7",
  "#5f87ff",
  "#5faf00",
  "#5faf5f",
  "#5faf87",
  "#5fafaf",
  "#5fafd7",
  "#5fafff",
  "#5fd700",
  "#5fd75f",
  "#5fd787",
  "#5fd7af",
  "#5fd7d7",
  "#5fd7ff",
  "#5fff00",
  "#5fff5f",
  "#5fff87",
  "#5fffaf",
  "#5fffd7",
  "#5fffff",
  "#870000",
  "#87005f",
  "#870087",
  "#8700af",
  "#8700d7",
  "#8700ff",
  "#875f00",
  "#875f5f",
  "#875f87",
  "#875faf",
  "#875fd7",
  "#875fff",
  "#878700",
  "#87875f",
  "#878787",
  "#8787af",
  "#8787d7",
  "#8787ff",
  "#87af00",
  "#87af5f",
  "#87af87",
  "#87afaf",
  "#87afd7",
  "#87afff",
  "#87d700",
  "#87d75f",
  "#87d787",
  "#87d7af",
  "#87d7d7",
  "#87d7ff",
  "#87ff00",
  "#87ff5f",
  "#87ff87",
  "#87ffaf",
  "#87ffd7",
  "#87ffff",
  "#af0000",
  "#af005f",
  "#af0087",
  "#af00af",
  "#af00d7",
  "#af00ff",
  "#af5f00",
  "#af5f5f",
  "#af5f87",
  "#af5faf",
  "#af5fd7",
  "#af5fff",
  "#af8700",
  "#af875f",
  "#af8787",
  "#af87af",
  "#af87d7",
  "#af87ff",
  "#afaf00",
  "#afaf5f",
  "#afaf87",
  "#afafaf",
  "#afafd7",
  "#afafff",
  "#afd700",
  "#afd75f",
  "#afd787",
  "#afd7af",
  "#afd7d7",
  "#afd7ff",
  "#afff00",
  "#afff5f",
  "#afff87",
  "#afffaf",
  "#afffd7",
  "#afffff",
  "#d70000",
  "#d7005f",
  "#d70087",
  "#d700af",
  "#d700d7",
  "#d700ff",
  "#d75f00",
  "#d75f5f",
  "#d75f87",
  "#d75faf",
  "#d75fd7",
  "#d75fff",
  "#d78700",
  "#d7875f",
  "#d78787",
  "#d787af",
  "#d787d7",
  "#d787ff",
  "#d7af00",
  "#d7af5f",
  "#d7af87",
  "#d7afaf",
  "#d7afd7",
  "#d7afff",
  "#d7d700",
  "#d7d75f",
  "#d7d787",
  "#d7d7af",
  "#d7d7d7",
  "#d7d7ff",
  "#d7ff00",
  "#d7ff5f",
  "#d7ff87",
  "#d7ffaf",
  "#d7ffd7",
  "#d7ffff",
  "#ff0000",
  "#ff005f",
  "#ff0087",
  "#ff00af",
  "#ff00d7",
  "#ff00ff",
  "#ff5f00",
  "#ff5f5f",
  "#ff5f87",
  "#ff5faf",
  "#ff5fd7",
  "#ff5fff",
  "#ff8700",
  "#ff875f",
  "#ff8787",
  "#ff87af",
  "#ff87d7",
  "#ff87ff",
  "#ffaf00",
  "#ffaf5f",
  "#ffaf87",
  "#ffafaf",
  "#ffafd7",
  "#ffafff",
  "#ffd700",
  "#ffd75f",
  "#ffd787",
  "#ffd7af",
  "#ffd7d7",
  "#ffd7ff",
  "#ffff00",
  "#ffff5f",
  "#ffff87",
  "#ffffaf",
  "#ffffd7",
  "#ffffff",
  "#080808",
  "#121212",
  "#1c1c1c",
  "#262626",
  "#303030",
  "#3a3a3a",
  "#444444",
  "#4e4e4e",
  "#585858",
  "#626262",
  "#6c6c6c",
  "#767676",
  "#808080",
  "#8a8a8a",
  "#949494",
  "#9e9e9e",
  "#a8a8a8",
  "#b2b2b2",
  "#bcbcbc",
  "#c6c6c6",
  "#d0d0d0",
  "#dadada",
  "#e4e4e4",
  "#eeeeee",
];
