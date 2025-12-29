import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BLOCK_RESOLUTION = 8;

const SHADED_BLOCK_ALPHA = new Map([
  [0x2591, 0.25],
  [0x2592, 0.5],
  [0x2593, 0.75],
]);

export default (props) => {
  const core = props.core;
  const textRowPool = [];
  const symbolRowPool = [];
  const symbolUsePool = [];
  const symbolDefCache = new Set();

  const [size, setSize] = createSignal(
    { cols: props.cols, rows: props.rows },
    { equals: (newVal, oldVal) => newVal.cols === oldVal.cols && newVal.rows === oldVal.rows },
  );

  const [theme, setTheme] = createSignal(buildTheme(FALLBACK_THEME));
  const lineHeight = () => props.lineHeight ?? 1.3333333333;
  const [blinkOn, setBlinkOn] = createSignal(true);
  const cursorOn = createMemo(() => blinkOn() || cursorHold);

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

  let cursor = {
    col: 0,
    row: 0,
    visible: false,
  };

  let pendingChanges = {
    size: undefined,
    theme: undefined,
    rows: new Set(),
  };

  let el;
  let bgCanvasEl;
  let bgCanvasCtx;
  let blocksCanvasEl;
  let blocksCanvasCtx;
  let textEl;
  let symbolsEl;
  let symbolDefsEl;
  let symbolRowsEl;
  let frameRequestId;
  let blinkIntervalId;
  let cssTheme;
  let cursorHold = false;

  onMount(() => {
    setupBgCanvas();
    setupBlocksCanvas();
    setInitialTheme();
    adjustTextRowNodeCount(size().rows);
    adjustSymbolRowNodeCount(size().rows);
    core.addEventListener("vtUpdate", onVtUpdate);
  });

  onCleanup(() => {
    core.removeEventListener("vtUpdate", onVtUpdate);
    clearInterval(blinkIntervalId);
    cancelAnimationFrame(frameRequestId);
  });

  createEffect(() => {
    if (props.blinking && blinkIntervalId === undefined) {
      blinkIntervalId = setInterval(toggleBlink, 600);
    } else {
      clearInterval(blinkIntervalId);
      blinkIntervalId = undefined;
      setBlinkOn(true);
    }
  });

  createEffect(() => {
    cursorOn();

    if (cursor.visible) {
      pendingChanges.rows.add(cursor.row);
      scheduleRender();
    }
  });

  function setupBgCanvas() {
    bgCanvasCtx = bgCanvasEl.getContext("2d");
    if (!bgCanvasCtx) throw new Error("2D ctx not available");
    const { cols, rows } = size();
    bgCanvasEl.width = cols;
    bgCanvasEl.height = rows;
    bgCanvasEl.style.imageRendering = "pixelated";
    bgCanvasCtx.imageSmoothingEnabled = false;
  }

  function setupBlocksCanvas() {
    blocksCanvasCtx = blocksCanvasEl.getContext("2d");
    if (!blocksCanvasCtx) throw new Error("2D ctx not available");
    const { cols, rows } = size();
    blocksCanvasEl.width = cols * BLOCK_RESOLUTION;
    blocksCanvasEl.height = rows * BLOCK_RESOLUTION;
    blocksCanvasEl.style.imageRendering = "pixelated";
    blocksCanvasCtx.imageSmoothingEnabled = false;
  }

  function resizeCanvas({ cols, rows }) {
    bgCanvasEl.width = cols;
    bgCanvasEl.height = rows;
    bgCanvasCtx.imageSmoothingEnabled = false;
  }

  function resizeBlocksCanvas({ cols, rows }) {
    blocksCanvasEl.width = cols * BLOCK_RESOLUTION;
    blocksCanvasEl.height = rows * BLOCK_RESOLUTION;
    blocksCanvasCtx.imageSmoothingEnabled = false;
  }

  function setInitialTheme() {
    cssTheme = getCssTheme(el);
    pendingChanges.theme = props.theme ?? cssTheme;
  }

  function onVtUpdate({ size: newSize, theme, changedRows }) {
    let activity = false;

    if (changedRows !== undefined) {
      for (const row of changedRows) {
        pendingChanges.rows.add(row);
        cursorHold = true;
        activity = true;
      }
    }

    if (theme !== undefined) {
      pendingChanges.theme = theme;

      for (let row = 0; row < size().rows; row++) {
        pendingChanges.rows.add(row);
      }
    }

    const newCursor = core.getCursor();

    if (
      newCursor.visible != cursor.visible ||
      newCursor.col != cursor.col ||
      newCursor.row != cursor.row
    ) {
      if (cursor.visible) {
        pendingChanges.rows.add(cursor.row);
      }

      if (newCursor.visible) {
        pendingChanges.rows.add(newCursor.row);
      }

      cursor = newCursor;
      cursorHold = true;
      activity = true;
    }

    if (newSize !== undefined) {
      pendingChanges.size = newSize;

      for (const row of pendingChanges.rows) {
        if (row >= newSize.rows) {
          pendingChanges.rows.delete(row);
        }
      }
    }

    if (activity && cursor.visible) {
      pendingChanges.rows.add(cursor.row);
    }

    scheduleRender();
  }

  function toggleBlink() {
    setBlinkOn((blink) => {
      if (!blink) cursorHold = false;
      return !blink;
    });
  }

  function scheduleRender() {
    if (frameRequestId === undefined) {
      frameRequestId = requestAnimationFrame(render);
    }
  }

  function render() {
    frameRequestId = undefined;
    const { size: newSize, theme: newTheme, rows } = pendingChanges;

    batch(function () {
      if (newSize !== undefined) {
        resizeCanvas(newSize);
        resizeBlocksCanvas(newSize);
        adjustTextRowNodeCount(newSize.rows);
        adjustSymbolRowNodeCount(newSize.rows);
        setSize(newSize);
      }

      if (newTheme !== undefined) {
        if (newTheme === null) {
          setTheme(buildTheme(cssTheme));
        } else {
          setTheme(buildTheme(newTheme));
        }
      }

      const theme_ = theme();
      const cursorOn_ = blinkOn() || cursorHold;

      for (const r of rows) {
        renderRow(r, theme_, cursorOn_);
      }
    });

    pendingChanges.size = undefined;
    pendingChanges.theme = undefined;
    pendingChanges.rows.clear();

    props.stats.renders += 1;
  }

  function renderRow(rowIndex, theme, cursorOn) {
    const line = core.getLine(rowIndex, cursorOn);

    renderRowText(rowIndex, line.text, theme);
    renderRowBlocks(rowIndex, line.blocks, theme);
    renderRowSymbols(rowIndex, line.symbols, theme);
    renderRowBg(rowIndex, line.bg, theme);
  }

  function renderRowText(rowIndex, spans, theme) {
    const frag = document.createDocumentFragment();

    for (const span of spans) {
      const el = document.createElement("span");
      const style = el.style;
      style.setProperty("--offset", span.get("x"));
      style.width = `${span.get("w") + 0.01}ch`; // Add 0.01ch to prevent sub-pixel gaps in some browsers
      el.textContent = span.get("t");

      const fg = colorValue(theme, span.get("c"));

      if (fg) {
        // TODO set color directly
        style.setProperty("--fg", fg);
      }

      const cls = span.get("k");

      if (cls !== undefined) {
        el.className = cls;
      }

      frag.appendChild(el);
    }

    textEl.children[rowIndex].replaceChildren(frag);
  }

  function renderRowBlocks(rowIndex, blocks, theme) {
    const y = rowIndex * BLOCK_RESOLUTION;
    const width = size().cols * BLOCK_RESOLUTION;
    blocksCanvasCtx.clearRect(0, y, width, BLOCK_RESOLUTION);

    for (const block of blocks) {
      const codepoint = block.get("cp");
      const x = block.get("x");

      const color = colorValue(theme, block.get("c")) || theme.fg;
      const alpha = SHADED_BLOCK_ALPHA.get(codepoint);

      if (alpha !== undefined) {
        blocksCanvasCtx.save();
        blocksCanvasCtx.globalAlpha = alpha;
        blocksCanvasCtx.fillStyle = color;
        blocksCanvasCtx.fillRect(x * BLOCK_RESOLUTION, y, BLOCK_RESOLUTION, BLOCK_RESOLUTION);
        blocksCanvasCtx.restore();
        continue;
      }

      blocksCanvasCtx.fillStyle = color;
      drawBlockGlyph(blocksCanvasCtx, codepoint, x * BLOCK_RESOLUTION, y);
    }
  }

  function renderRowSymbols(rowIndex, symbols, theme) {
    const symbolFrag = document.createDocumentFragment();
    const symbolRow = symbolRowsEl.children[rowIndex];

    for (const symbol of symbols) {
      const codepoint = symbol.get("cp");
      const x = symbol.get("x");
      const color = colorValue(theme, symbol.get("c"));
      const blink = symbol.get("b") === true;
      const el = createSymbolNode(codepoint, x, color, blink);

      if (el) {
        symbolFrag.appendChild(el);
      }
    }

    recycleSymbolUses(symbolRow);
    symbolRow.replaceChildren(symbolFrag);
  }

  function renderRowBg(rowIndex, spans, theme) {
    bgCanvasCtx.clearRect(0, rowIndex, size().cols, 1);

    for (const span of spans) {
      bgCanvasCtx.fillStyle = colorValue(theme, span.get("c"));
      bgCanvasCtx.fillRect(span.get("x"), rowIndex, span.get("w"), 1);
    }
  }

  function adjustTextRowNodeCount(rows) {
    let r = textEl.children.length;

    if (r < rows) {
      const frag = document.createDocumentFragment();

      while (r < rows) {
        const row = getNewRow();
        row.style.setProperty("--row", r);
        frag.appendChild(row);
        r += 1;
      }

      textEl.appendChild(frag);
    }

    while (textEl.children.length > rows) {
      const row = textEl.lastElementChild;
      textEl.removeChild(row);
      textRowPool.push(row);
    }
  }

  function adjustSymbolRowNodeCount(rows) {
    let r = symbolRowsEl.children.length;

    if (r < rows) {
      const frag = document.createDocumentFragment();

      while (r < rows) {
        const row = getNewSymbolRow();
        row.setAttribute("transform", `translate(0 ${r})`);
        frag.appendChild(row);
        r += 1;
      }

      symbolRowsEl.appendChild(frag);
    }

    while (symbolRowsEl.children.length > rows) {
      const row = symbolRowsEl.lastElementChild;
      symbolRowsEl.removeChild(row);
      symbolRowPool.push(row);
    }
  }

  function getNewRow() {
    let row = textRowPool.pop();

    if (row === undefined) {
      row = document.createElement("span");
      row.className = "ap-line";
    }

    return row;
  }

  function getNewSymbolRow() {
    let row = symbolRowPool.pop();

    if (row === undefined) {
      row = document.createElementNS(SVG_NS, "g");
      row.setAttribute("class", "ap-symbol-line");
    }

    return row;
  }

  function createSymbolNode(codepoint, x, fg, blink) {
    if (!ensureSymbolDef(codepoint)) {
      return null;
    }

    const isPowerline = POWERLINE_SYMBOLS.has(codepoint);
    const symbolX = isPowerline ? x - POWERLINE_SYMBOL_NUDGE : x;
    const symbolWidth = isPowerline ? 1 + POWERLINE_SYMBOL_NUDGE * 2 : 1;

    const node = getSymbolUse();
    node.setAttribute("href", `#sym-${codepoint}`);
    node.setAttribute("x", symbolX);
    node.setAttribute("y", 0);
    node.setAttribute("width", symbolWidth);
    node.setAttribute("height", "1");

    if (fg) {
      node.style.setProperty("color", fg);
    } else {
      node.style.removeProperty("color");
    }

    if (blink) {
      node.classList.add("ap-blink");
    } else {
      node.classList.remove("ap-blink");
    }

    return node;
  }

  function recycleSymbolUses(row) {
    while (row.firstChild) {
      const child = row.firstChild;
      row.removeChild(child);
      symbolUsePool.push(child);
    }
  }

  function getSymbolUse() {
    let node = symbolUsePool.pop();

    if (node === undefined) {
      node = document.createElementNS(SVG_NS, "use");
    }

    return node;
  }

  function ensureSymbolDef(codepoint) {
    const content = SYMBOL_DEFS[codepoint];

    if (!content) {
      return false;
    }

    if (symbolDefCache.has(codepoint)) {
      return true;
    }

    const id = `sym-${codepoint}`;
    const symbol = document.createElementNS(SVG_NS, "symbol");
    symbol.setAttribute("id", id);
    symbol.setAttribute("viewBox", "0 0 1 1");
    symbol.setAttribute("preserveAspectRatio", "none");
    symbol.innerHTML = content;
    symbolDefsEl.appendChild(symbol);
    symbolDefCache.add(codepoint);
    return true;
  }

  return (
    <div class="ap-term" style={style()} ref={el}>
      <canvas class="ap-term-bg" ref={bgCanvasEl} />
      <canvas class="ap-term-blocks" ref={blocksCanvasEl} />
      <svg
        class="ap-term-symbols"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${size().cols} ${size().rows}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
        classList={{ "ap-blink": blinkOn() }}
        ref={symbolsEl}
      >
        <defs ref={symbolDefsEl}></defs>
        <g ref={symbolRowsEl}></g>
      </svg>
      <pre
        class="ap-term-text"
        classList={{ "ap-blink": blinkOn() }}
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
    if (c === undefined) throw new Error(`--term-color-${i} has not been defined`);
    palette[i] = c;
  }

  return { foreground, background, palette };
}

function colorValue(theme, color) {
  if (typeof color === "number") return theme.palette[color];

  if (typeof color === "string") {
    if (color == "fg") return theme.fg;
    if (color == "bg") return theme.bg;
    return color;
  }
}

function drawBlockGlyph(ctx, codepoint, x, y) {
  switch (codepoint) {
    case 0x2580:
      // upper half block
      ctx.fillRect(x, y, 8, 4);
      break;
    case 0x2581:
      // lower one eighth block
      ctx.fillRect(x, y + 7, 8, 1);
      break;
    case 0x2582:
      // lower one quarter block
      ctx.fillRect(x, y + 6, 8, 2);
      break;
    case 0x2583:
      // lower three eighths block
      ctx.fillRect(x, y + 5, 8, 3);
      break;
    case 0x2584:
      // lower half block
      ctx.fillRect(x, y + 4, 8, 4);
      break;
    case 0x2585:
      // lower five eighths block
      ctx.fillRect(x, y + 3, 8, 5);
      break;
    case 0x2586:
      // lower three quarters block
      ctx.fillRect(x, y + 2, 8, 6);
      break;
    case 0x2587:
      // lower seven eighths block
      ctx.fillRect(x, y + 1, 8, 7);
      break;
    case 0x2588:
      // full block
      ctx.fillRect(x, y, 8, 8);
      break;
    case 0x25a0:
      // black square
      ctx.fillRect(x, y + 2, 8, 4);
      break;
    case 0x2589:
      // left seven eighths block
      ctx.fillRect(x, y, 7, 8);
      break;
    case 0x258a:
      // left three quarters block
      ctx.fillRect(x, y, 6, 8);
      break;
    case 0x258b:
      // left five eighths block
      ctx.fillRect(x, y, 5, 8);
      break;
    case 0x258c:
      // left half block
      ctx.fillRect(x, y, 4, 8);
      break;
    case 0x258d:
      // left three eighths block
      ctx.fillRect(x, y, 3, 8);
      break;
    case 0x258e:
      // left one quarter block
      ctx.fillRect(x, y, 2, 8);
      break;
    case 0x258f:
      // left one eighth block
      ctx.fillRect(x, y, 1, 8);
      break;
    case 0x2590:
      // right half block
      ctx.fillRect(x + 4, y, 4, 8);
      break;
    case 0x2594:
      // upper one eighth block
      ctx.fillRect(x, y, 8, 1);
      break;
    case 0x2595:
      // right one eighth block
      ctx.fillRect(x + 7, y, 1, 8);
      break;
    case 0x2596:
      // quadrant lower left
      ctx.fillRect(x, y + 4, 4, 4);
      break;
    case 0x2597:
      // quadrant lower right
      ctx.fillRect(x + 4, y + 4, 4, 4);
      break;
    case 0x2598:
      // quadrant upper left
      ctx.fillRect(x, y, 4, 4);
      break;
    case 0x2599:
      // quadrant upper left and lower left and lower right
      ctx.fillRect(x, y, 4, 8);
      ctx.fillRect(x + 4, y + 4, 4, 4);
      break;
    case 0x259a:
      // quadrant upper left and lower right
      ctx.fillRect(x, y, 4, 4);
      ctx.fillRect(x + 4, y + 4, 4, 4);
      break;
    case 0x259b:
      // quadrant upper left and upper right and lower left
      ctx.fillRect(x, y, 8, 4);
      ctx.fillRect(x, y + 4, 4, 4);
      break;
    case 0x259c:
      // quadrant upper left and upper right and lower right
      ctx.fillRect(x, y, 8, 4);
      ctx.fillRect(x + 4, y + 4, 4, 4);
      break;
    case 0x259d:
      // quadrant upper right
      ctx.fillRect(x + 4, y, 4, 4);
      break;
    case 0x259e:
      // quadrant upper right and lower left
      ctx.fillRect(x + 4, y, 4, 4);
      ctx.fillRect(x, y + 4, 4, 4);
      break;
    case 0x259f:
      // quadrant upper right and lower left and lower right
      ctx.fillRect(x + 4, y, 4, 8);
      ctx.fillRect(x, y + 4, 4, 4);
      break;
    default:
      break;
  }
}

const SYMBOL_DEFS = {
  // powerline right full triangle
  0xe0b0: '<path d="M0,0 L1,0.5 L0,1 Z" fill="currentColor"/>',
  // powerline right bracket
  0xe0b1:
    '<path d="M0,0 L1,0.5 L0,1" fill="none" stroke="currentColor" stroke-width="0.07" stroke-linejoin="miter"/>',
  // powerline left full triangle
  0xe0b2: '<path d="M1,0 L0,0.5 L1,1 Z" fill="currentColor"/>',
  // powerline left bracket
  0xe0b3:
    '<path d="M1,0 L0,0.5 L1,1" fill="none" stroke="currentColor" stroke-width="0.07" stroke-linejoin="miter"/>',
};

const POWERLINE_SYMBOLS = new Set([0xe0b0, 0xe0b1, 0xe0b2, 0xe0b3]);
const POWERLINE_SYMBOL_NUDGE = 0.02;

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
