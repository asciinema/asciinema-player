import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BLOCK_H_RES = 8;
const BLOCK_V_RES = 24;

const BOLD_MASK = 1;
const FAINT_MASK = 1 << 1;
const ITALIC_MASK = 1 << 2;
const UNDERLINE_MASK = 1 << 3;
const STRIKETHROUGH_MASK = 1 << 4;
const BLINK_MASK = 1 << 5;

export default (props) => {
  const core = props.core;
  const textRowPool = [];
  const vectorSymbolRowPool = [];
  const vectorSymbolUsePool = [];
  const vectorSymbolDefCache = new Set();
  const colorsCache = new Map();
  const attrClassCache = new Map();

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
  let canvasEl;
  let canvasCtx;
  let textEl;
  let vectorSymbolsEl;
  let vectorSymbolDefsEl;
  let vectorSymbolRowsEl;
  let frameRequestId;
  let blinkIntervalId;
  let cssTheme;
  let cursorHold = false;

  onMount(() => {
    setupCanvas();
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

  function setupCanvas() {
    canvasCtx = canvasEl.getContext("2d");
    if (!canvasCtx) throw new Error("2D ctx not available");
    const { cols, rows } = size();
    canvasEl.width = cols * BLOCK_H_RES;
    canvasEl.height = rows * BLOCK_V_RES;
    canvasEl.style.imageRendering = "pixelated";
    canvasCtx.imageSmoothingEnabled = false;
  }

  function resizeCanvas({ cols, rows }) {
    canvasEl.width = cols * BLOCK_H_RES;
    canvasEl.height = rows * BLOCK_V_RES;
    canvasCtx.imageSmoothingEnabled = false;
  }

  function setInitialTheme() {
    cssTheme = getCssTheme(el);
    pendingChanges.theme = cssTheme;
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

    if (theme !== undefined && props.preferEmbeddedTheme) {
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

        colorsCache.clear();
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

    clearCanvasRow(rowIndex);
    renderRowBg(rowIndex, line.bg, theme);
    renderRowRasterSymbols(rowIndex, line.raster_symbols, theme);
    renderRowVectorSymbols(rowIndex, line.vector_symbols, theme);
    renderRowText(rowIndex, line.text, line.codepoints, theme);
  }

  function clearCanvasRow(rowIndex) {
    canvasCtx.clearRect(0, rowIndex * BLOCK_V_RES, size().cols * BLOCK_H_RES, BLOCK_V_RES);
  }

  function renderRowBg(rowIndex, spans, theme) {
    // The memory layout of a BgSpan must follow one defined in lib.rs (see the assertions at the bottom)
    const view = core.getDataView(spans, 8);

    const y = rowIndex * BLOCK_V_RES;
    let i = 0;

    while (i < view.byteLength) {
      const column = view.getUint16(i + 0, true);
      const width = view.getUint16(i + 2, true);
      const color = getColor(view, i + 4, theme);
      i += 8;

      canvasCtx.fillStyle = color;
      canvasCtx.fillRect(column * BLOCK_H_RES, y, width * BLOCK_H_RES, BLOCK_V_RES);
    }
  }

  function renderRowRasterSymbols(rowIndex, symbols, theme) {
    // The memory layout of a RasterSymbol must follow one defined in lib.rs (see the assertions at the bottom)
    const view = core.getDataView(symbols, 12);

    const y = rowIndex * BLOCK_V_RES;
    let i = 0;

    while (i < view.byteLength) {
      const column = view.getUint16(i + 0, true);
      const codepoint = view.getUint32(i + 4, true);
      const color = getColor(view, i + 8, theme) || theme.fg;
      i += 12;

      canvasCtx.fillStyle = color;
      drawBlockGlyph(canvasCtx, codepoint, column * BLOCK_H_RES, y);
    }
  }

  function renderRowVectorSymbols(rowIndex, symbols, theme) {
    // The memory layout of a VectorSymbol must follow one defined in lib.rs (see the assertions at the bottom)
    const view = core.getDataView(symbols, 16);

    const frag = document.createDocumentFragment();
    const symbolRow = vectorSymbolRowsEl.children[rowIndex];
    let i = 0;

    while (i < view.byteLength) {
      const column = view.getUint16(i + 0, true);
      const codepoint = view.getUint32(i + 4, true);
      const color = getColor(view, i + 8, theme);
      const attrs = view.getUint8(i + 12);
      i += 16;

      const blink = (attrs & BLINK_MASK) !== 0;
      const el = createVectorSymbolNode(codepoint, column, color, blink);

      if (el) {
        frag.appendChild(el);
      }
    }

    recycleVectorSymbolUses(symbolRow);
    symbolRow.replaceChildren(frag);
  }

  function renderRowText(rowIndex, spans, codepoints, theme) {
    // The memory layout of a TextSpan must follow one defined in lib.rs (see the assertions at the bottom)
    const spansView = core.getDataView(spans, 12);

    const codepointsView = core.getUint32Array(codepoints);
    const frag = document.createDocumentFragment();
    let i = 0;

    while (i < spansView.byteLength) {
      const column = spansView.getUint16(i + 0, true);
      const codepointsStart = spansView.getUint16(i + 2, true);
      const len = spansView.getUint16(i + 4, true);
      const color = getColor(spansView, i + 6, theme);
      const attrs = spansView.getUint8(i + 10);
      const text = String.fromCodePoint(
        ...codepointsView.subarray(codepointsStart, codepointsStart + len),
      );
      i += 12;

      const el = document.createElement("span");
      const style = el.style;
      style.setProperty("--offset", column);
      el.textContent = text;

      if (color) {
        style.color = color;
      }

      const cls = getAttrClass(attrs);

      if (cls !== null) {
        el.className = cls;
      }

      frag.appendChild(el);
    }

    textEl.children[rowIndex].replaceChildren(frag);
  }

  function getAttrClass(attrs) {
    let c = attrClassCache.get(attrs);

    if (c === undefined) {
      c = buildAttrClass(attrs);
      attrClassCache.set(attrs, c);
    }

    return c;
  }

  function buildAttrClass(attrs) {
    let cls = "";

    if ((attrs & BOLD_MASK) !== 0) {
      cls += "ap-bold ";
    } else if ((attrs & FAINT_MASK) !== 0) {
      cls += "ap-faint ";
    }

    if ((attrs & ITALIC_MASK) !== 0) {
      cls += "ap-italic ";
    }

    if ((attrs & UNDERLINE_MASK) !== 0) {
      cls += "ap-underline ";
    }

    if ((attrs & STRIKETHROUGH_MASK) !== 0) {
      cls += "ap-strike ";
    }

    if ((attrs & BLINK_MASK) !== 0) {
      cls += "ap-blink ";
    }

    return cls === "" ? null : cls;
  }

  function getColor(view, offset, theme) {
    const tag = view.getUint8(offset);

    if (tag === 0) {
      return null;
    } else if (tag === 1) {
      return theme.fg;
    } else if (tag === 2) {
      return theme.bg;
    } else if (tag === 3) {
      return theme.palette[view.getUint8(offset + 1)];
    } else if (tag === 4) {
      const key = view.getUint32(offset, true);
      let c = colorsCache.get(key);

      if (c === undefined) {
        const r = view.getUint8(offset + 1);
        const g = view.getUint8(offset + 2);
        const b = view.getUint8(offset + 3);
        c = "rgb(" + r + "," + g + "," + b + ")";
        colorsCache.set(key, c);
      }

      return c;
    } else {
      throw new Error(`invalid color tag: ${tag}`);
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
    let r = vectorSymbolRowsEl.children.length;

    if (r < rows) {
      const frag = document.createDocumentFragment();

      while (r < rows) {
        const row = getNewSymbolRow();
        row.setAttribute("transform", `translate(0 ${r})`);
        frag.appendChild(row);
        r += 1;
      }

      vectorSymbolRowsEl.appendChild(frag);
    }

    while (vectorSymbolRowsEl.children.length > rows) {
      const row = vectorSymbolRowsEl.lastElementChild;
      vectorSymbolRowsEl.removeChild(row);
      vectorSymbolRowPool.push(row);
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
    let row = vectorSymbolRowPool.pop();

    if (row === undefined) {
      row = document.createElementNS(SVG_NS, "g");
      row.setAttribute("class", "ap-symbol-line");
    }

    return row;
  }

  function createVectorSymbolNode(codepoint, column, fg, blink) {
    if (!ensureVectorSymbolDef(codepoint)) {
      return null;
    }

    const isPowerline = POWERLINE_SYMBOLS.has(codepoint);
    const symbolX = isPowerline ? column - POWERLINE_SYMBOL_NUDGE : column;
    const symbolWidth = isPowerline ? 1 + POWERLINE_SYMBOL_NUDGE * 2 : 1;

    const node = getVectorSymbolUse();
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

  function recycleVectorSymbolUses(row) {
    while (row.firstChild) {
      const child = row.firstChild;
      row.removeChild(child);
      vectorSymbolUsePool.push(child);
    }
  }

  function getVectorSymbolUse() {
    let node = vectorSymbolUsePool.pop();

    if (node === undefined) {
      node = document.createElementNS(SVG_NS, "use");
    }

    return node;
  }

  function ensureVectorSymbolDef(codepoint) {
    const content = getVectorSymbolDef(codepoint);

    if (!content) {
      return false;
    }

    if (vectorSymbolDefCache.has(codepoint)) {
      return true;
    }

    const id = `sym-${codepoint}`;
    const symbol = document.createElementNS(SVG_NS, "symbol");
    symbol.setAttribute("id", id);
    symbol.setAttribute("viewBox", "0 0 1 1");
    symbol.setAttribute("preserveAspectRatio", "none");
    symbol.setAttribute("overflow", "visible");
    symbol.innerHTML = content;
    vectorSymbolDefsEl.appendChild(symbol);
    vectorSymbolDefCache.add(codepoint);
    return true;
  }

  return (
    <div class="ap-term" style={style()} ref={el}>
      <canvas ref={canvasEl} />
      <svg
        class="ap-term-symbols"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${size().cols} ${size().rows}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
        classList={{ "ap-blink": blinkOn() }}
        ref={vectorSymbolsEl}
      >
        <defs ref={vectorSymbolDefsEl}></defs>
        <g ref={vectorSymbolRowsEl}></g>
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

function drawBlockGlyph(ctx, codepoint, x, y) {
  const unitX = BLOCK_H_RES / 8;
  const unitY = BLOCK_V_RES / 8;
  const halfX = BLOCK_H_RES / 2;
  const halfY = BLOCK_V_RES / 2;
  const sextantX = BLOCK_H_RES / 2;
  const sextantY = BLOCK_V_RES / 3;

  switch (codepoint) {
    case 0x2580:
      // upper half block (https://symbl.cc/en/2580/)
      ctx.fillRect(x, y, BLOCK_H_RES, halfY);
      break;

    case 0x2581:
      // lower one eighth block (https://symbl.cc/en/2581/)
      ctx.fillRect(x, y + unitY * 7, BLOCK_H_RES, unitY);
      break;

    case 0x2582:
      // lower one quarter block (https://symbl.cc/en/2582/)
      ctx.fillRect(x, y + unitY * 6, BLOCK_H_RES, unitY * 2);
      break;
    case 0x2583:
      // lower three eighths block (https://symbl.cc/en/2583/)
      ctx.fillRect(x, y + unitY * 5, BLOCK_H_RES, unitY * 3);
      break;

    case 0x2584:
      // lower half block (https://symbl.cc/en/2584/)
      ctx.fillRect(x, y + halfY, BLOCK_H_RES, halfY);
      break;

    case 0x2585:
      // lower five eighths block (https://symbl.cc/en/2585/)
      ctx.fillRect(x, y + unitY * 3, BLOCK_H_RES, unitY * 5);
      break;

    case 0x2586:
      // lower three quarters block (https://symbl.cc/en/2586/)
      ctx.fillRect(x, y + unitY * 2, BLOCK_H_RES, unitY * 6);
      break;

    case 0x2587:
      // lower seven eighths block (https://symbl.cc/en/2587/)
      ctx.fillRect(x, y + unitY, BLOCK_H_RES, unitY * 7);
      break;

    case 0x2588:
      // full block (https://symbl.cc/en/2588/)
      ctx.fillRect(x, y, BLOCK_H_RES, BLOCK_V_RES);
      break;

    case 0x25a0:
      // black square (https://symbl.cc/en/25A0/)
      ctx.fillRect(x, y + unitY * 2, BLOCK_H_RES, unitY * 4);
      break;

    case 0x2589:
      // left seven eighths block (https://symbl.cc/en/2589/)
      ctx.fillRect(x, y, unitX * 7, BLOCK_V_RES);
      break;

    case 0x258a:
      // left three quarters block (https://symbl.cc/en/258A/)
      ctx.fillRect(x, y, unitX * 6, BLOCK_V_RES);
      break;

    case 0x258b:
      // left five eighths block (https://symbl.cc/en/258B/)
      ctx.fillRect(x, y, unitX * 5, BLOCK_V_RES);
      break;

    case 0x258c:
      // left half block (https://symbl.cc/en/258C/)
      ctx.fillRect(x, y, halfX, BLOCK_V_RES);
      break;

    case 0x258d:
      // left three eighths block (https://symbl.cc/en/258D/)
      ctx.fillRect(x, y, unitX * 3, BLOCK_V_RES);
      break;

    case 0x258e:
      // left one quarter block (https://symbl.cc/en/258E/)
      ctx.fillRect(x, y, unitX * 2, BLOCK_V_RES);
      break;

    case 0x258f:
      // left one eighth block (https://symbl.cc/en/258F/)
      ctx.fillRect(x, y, unitX, BLOCK_V_RES);
      break;

    case 0x2590:
      // right half block (https://symbl.cc/en/2590/)
      ctx.fillRect(x + halfX, y, halfX, BLOCK_V_RES);
      break;

    case 0x2591:
      // light shade (https://symbl.cc/en/2591/)
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x, y, BLOCK_H_RES, BLOCK_V_RES);
      ctx.restore();
      break;

    case 0x2592:
      // medium shade (https://symbl.cc/en/2592/)
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y, BLOCK_H_RES, BLOCK_V_RES);
      ctx.restore();
      break;

    case 0x2593:
      // dark shade (https://symbl.cc/en/2593/)
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y, BLOCK_H_RES, BLOCK_V_RES);
      ctx.restore();
      break;

    case 0x2594:
      // upper one eighth block (https://symbl.cc/en/2594/)
      ctx.fillRect(x, y, BLOCK_H_RES, unitY);
      break;

    case 0x2595:
      // right one eighth block (https://symbl.cc/en/2595/)
      ctx.fillRect(x + unitX * 7, y, unitX, BLOCK_V_RES);
      break;

    case 0x2596:
      // quadrant lower left (https://symbl.cc/en/2596/)
      ctx.fillRect(x, y + halfY, halfX, halfY);
      break;

    case 0x2597:
      // quadrant lower right (https://symbl.cc/en/2597/)
      ctx.fillRect(x + halfX, y + halfY, halfX, halfY);
      break;

    case 0x2598:
      // quadrant upper left (https://symbl.cc/en/2598/)
      ctx.fillRect(x, y, halfX, halfY);
      break;

    case 0x2599:
      // quadrant upper left and lower left and lower right (https://symbl.cc/en/2599/)
      ctx.fillRect(x, y, halfX, BLOCK_V_RES);
      ctx.fillRect(x + halfX, y + halfY, halfX, halfY);
      break;

    case 0x259a:
      // quadrant upper left and lower right (https://symbl.cc/en/259A/)
      ctx.fillRect(x, y, halfX, halfY);
      ctx.fillRect(x + halfX, y + halfY, halfX, halfY);
      break;

    case 0x259b:
      // quadrant upper left and upper right and lower left (https://symbl.cc/en/259B/)
      ctx.fillRect(x, y, BLOCK_H_RES, halfY);
      ctx.fillRect(x, y + halfY, halfX, halfY);
      break;

    case 0x259c:
      // quadrant upper left and upper right and lower right (https://symbl.cc/en/259C/)
      ctx.fillRect(x, y, BLOCK_H_RES, halfY);
      ctx.fillRect(x + halfX, y + halfY, halfX, halfY);
      break;

    case 0x259d:
      // quadrant upper right (https://symbl.cc/en/259D/)
      ctx.fillRect(x + halfX, y, halfX, halfY);
      break;

    case 0x259e:
      // quadrant upper right and lower left (https://symbl.cc/en/259E/)
      ctx.fillRect(x + halfX, y, halfX, halfY);
      ctx.fillRect(x, y + halfY, halfX, halfY);
      break;

    case 0x259f:
      // quadrant upper right and lower left and lower right (https://symbl.cc/en/259F/)
      ctx.fillRect(x + halfX, y, halfX, BLOCK_V_RES);
      ctx.fillRect(x, y + halfY, halfX, halfY);
      break;

    case 0x1fb00:
      // sextant-1: upper left (https://symbl.cc/en/1FB00/)
      ctx.fillRect(x, y, sextantX, sextantY);
      break;

    case 0x1fb01:
      // sextant-2: upper right (https://symbl.cc/en/1FB01/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      break;

    case 0x1fb02:
      // sextant-12: upper one third (https://symbl.cc/en/1FB02/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      break;

    case 0x1fb03:
      // sextant-3: middle left (https://symbl.cc/en/1FB03/)
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb04:
      // sextant-13: top-left and middle-left filled (https://symbl.cc/en/1FB04/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb05:
      // sextant-23: upper right and middle left (https://symbl.cc/en/1FB05/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb06:
      // sextant-123: upper one third and middle left (https://symbl.cc/en/1FB06/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb07:
      // sextant-4: middle right (https://symbl.cc/en/1FB07/)
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb08:
      // sextant-14: upper left and middle right (https://symbl.cc/en/1FB08/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb09:
      // sextant-24: top-right and middle-right filled (https://symbl.cc/en/1FB09/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb0a:
      // sextant-124: upper one third and middle right (https://symbl.cc/en/1FB0A/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb0b:
      // sextant-34: middle one third (https://symbl.cc/en/1FB0B/)
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      break;

    case 0x1fb0c:
      // sextant-134: upper left, middle left and middle right (https://symbl.cc/en/1FB0C/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      break;

    case 0x1fb0d:
      // sextant-234: upper right and middle one third (https://symbl.cc/en/1FB0D/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      break;

    case 0x1fb0e:
      // sextant-1234: top and middle rows filled (https://symbl.cc/en/1FB0E/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      break;

    case 0x1fb0f:
      // sextant-5: lower left (https://symbl.cc/en/1FB0F/)
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb10:
      // sextant-15: upper left and lower left (https://symbl.cc/en/1FB10/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb11:
      // sextant-25: upper right and lower left (https://symbl.cc/en/1FB11/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb12:
      // sextant-125: upper one third and lower left (https://symbl.cc/en/1FB12/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb13:
      // sextant-35: middle left and lower left (https://symbl.cc/en/1FB13/)
      ctx.fillRect(x, y + sextantY, sextantX, sextantY * 2);
      break;

    case 0x1fb14:
      // sextant-235: upper right and left column lower two thirds (https://symbl.cc/en/1FB14/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY * 2);
      break;

    case 0x1fb15:
      // sextant-1235: upper one third and left column lower two thirds (https://symbl.cc/en/1FB15/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY * 2);
      break;

    case 0x1fb16:
      // sextant-45: middle right and lower left (https://symbl.cc/en/1FB16/)
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb17:
      // sextant-145: upper left, middle right and lower left (https://symbl.cc/en/1FB17/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb18:
      // sextant-245: right column upper two thirds and lower left (https://symbl.cc/en/1FB18/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY * 2);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb19:
      // sextant-1245: upper one third, middle right and lower left (https://symbl.cc/en/1FB19/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb1a:
      // sextant-345: middle one third and lower left (https://symbl.cc/en/1FB1A/)
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb1b:
      // sextant-1345: left column and middle right (https://symbl.cc/en/1FB1B/)
      ctx.fillRect(x, y, sextantX, sextantY * 3);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      break;

    case 0x1fb1c:
      // sextant-2345: upper right, middle one third and lower left (https://symbl.cc/en/1FB1C/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb1d:
      // sextant-12345: upper two thirds and lower left (https://symbl.cc/en/1FB1D/)
      ctx.fillRect(x, y, sextantX * 2, sextantY * 2);
      ctx.fillRect(x, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb1e:
      // sextant-6: lower right (https://symbl.cc/en/1FB1E/)
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb1f:
      // sextant-16: upper left and lower right (https://symbl.cc/en/1FB1F/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb20:
      // sextant-26: upper right and lower right (https://symbl.cc/en/1FB20/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb21:
      // sextant-126: upper one third and lower right (https://symbl.cc/en/1FB21/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb22:
      // sextant-36: middle left and lower right (https://symbl.cc/en/1FB22/)
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb23:
      // sextant-136: upper left, middle left and lower right (https://symbl.cc/en/1FB23/)
      ctx.fillRect(x, y, sextantX, sextantY * 2);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb24:
      // sextant-236: upper right, middle left and lower right (https://symbl.cc/en/1FB24/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb25:
      // sextant-1236: upper one third, middle left and lower right (https://symbl.cc/en/1FB25/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb26:
      // sextant-46: middle right and lower right (https://symbl.cc/en/1FB26/)
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY * 2);
      break;

    case 0x1fb27:
      // sextant-146: upper left and right column lower two thirds (https://symbl.cc/en/1FB27/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY * 2);
      break;

    case 0x1fb28:
      // sextant-1246: upper one third and right column lower two thirds (https://symbl.cc/en/1FB28/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY * 2);
      break;

    case 0x1fb29:
      // sextant-346: middle one third and lower right (https://symbl.cc/en/1FB29/)
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb2a:
      // sextant-1346: left column upper two thirds and right column lower two thirds (https://symbl.cc/en/1FB2A/)
      ctx.fillRect(x, y, sextantX, sextantY * 2);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY * 2);
      break;

    case 0x1fb2b:
      // sextant-2346: upper right, middle one third and lower right (https://symbl.cc/en/1FB2B/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb2c:
      // sextant-12346: upper two thirds and lower right (https://symbl.cc/en/1FB2C/)
      ctx.fillRect(x, y, sextantX * 2, sextantY * 2);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb2d:
      // sextant-56: lower one third (https://symbl.cc/en/1FB2D/)
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb2e:
      // sextant-156: upper left and lower one third (https://symbl.cc/en/1FB2E/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb2f:
      // sextant-256: upper right and lower one third (https://symbl.cc/en/1FB2F/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb30:
      // sextant-1256: upper one third and lower one third (https://symbl.cc/en/1FB30/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb31:
      // sextant-356: middle left and lower one third (https://symbl.cc/en/1FB31/)
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb32:
      // sextant-1356: left column upper two thirds and lower one third (https://symbl.cc/en/1FB32/)
      ctx.fillRect(x, y, sextantX, sextantY * 2);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb33:
      // sextant-2356: upper right, middle left and lower one third (https://symbl.cc/en/1FB33/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb34:
      // sextant-12356: upper one third, middle left and lower one third (https://symbl.cc/en/1FB34/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb35:
      // sextant-456: middle right and lower one third (https://symbl.cc/en/1FB35/)
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb36:
      // sextant-1456: upper left, middle right and lower one third (https://symbl.cc/en/1FB36/)
      ctx.fillRect(x, y, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb37:
      // sextant-2456: right column upper two thirds and lower one third (https://symbl.cc/en/1FB37/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY * 2);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb38:
      // sextant-12456: upper one third, middle right and lower one third (https://symbl.cc/en/1FB38/)
      ctx.fillRect(x, y, sextantX * 2, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY * 2, sextantX * 2, sextantY);
      break;

    case 0x1fb39:
      // sextant-3456: middle one third and lower one third (https://symbl.cc/en/1FB39/)
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY * 2);
      break;

    case 0x1fb3a:
      // sextant-13456: left column and lower one third (https://symbl.cc/en/1FB3A/)
      ctx.fillRect(x, y, sextantX, sextantY * 3);
      ctx.fillRect(x + sextantX, y + sextantY, sextantX, sextantY);
      ctx.fillRect(x + sextantX, y + sextantY * 2, sextantX, sextantY);
      break;

    case 0x1fb3b:
      // sextant-23456: upper right and lower two thirds (https://symbl.cc/en/1FB3B/)
      ctx.fillRect(x + sextantX, y, sextantX, sextantY);
      ctx.fillRect(x, y + sextantY, sextantX * 2, sextantY * 2);
      break;

    default:
      break;
  }
}

const SYMBOL_STROKE = 0.05;
const CELL_RATIO = 9.0375 / 20;

function getVectorSymbolDef(codepoint) {
  const stroke = `stroke="currentColor" stroke-width="${SYMBOL_STROKE}" stroke-linejoin="miter" stroke-linecap="square"`;
  const strokeButt = `stroke="currentColor" stroke-width="${SYMBOL_STROKE}" stroke-linejoin="miter" stroke-linecap="butt"`;
  const stroked = (d) => `<path d="${d}" fill="none" ${stroke}/>`;
  const third = 1 / 3;
  const twoThirds = 2 / 3;

  switch (codepoint) {
    // ◢ - black lower right triangle (https://symbl.cc/en/25E2/)
    case 0x25e2:
      return '<path d="M1,1 L1,0 L0,1 Z" fill="currentColor"/>' + stroked("M1,1 L1,0 L0,1 Z");

    // ◣ - black lower left triangle (https://symbl.cc/en/25E3/)
    case 0x25e3:
      return '<path d="M0,1 L0,0 L1,1 Z" fill="currentColor"/>' + stroked("M0,1 L0,0 L1,1 Z");

    // ◤ - black upper left triangle (https://symbl.cc/en/25E4/)
    case 0x25e4:
      return '<path d="M0,0 L1,0 L0,1 Z" fill="currentColor"/>' + stroked("M0,0 L1,0 L0,1 Z");

    // ◥ - black upper right triangle (https://symbl.cc/en/25E5/)
    case 0x25e5:
      return '<path d="M1,0 L1,1 L0,0 Z" fill="currentColor"/>' + stroked("M1,0 L1,1 L0,0 Z");

    case 0x268f: {
      // ⚏ - digram for greater yin (https://symbl.cc/en/268F/)
      const horizontalGap = 0.15;
      const verticalGap = 0.2;
      const lineHeight = 0.17;
      const halfHorizontalGap = horizontalGap / 2;
      const halfVerticalGap = verticalGap / 2;
      const toViewBoxY = (offset) => 0.5 + offset * CELL_RATIO;
      const leftX1 = 0.5 - halfHorizontalGap;
      const rightX0 = 0.5 + halfHorizontalGap;
      const rightX1 = 1 + 0.02; // slight overdraw
      const topY0 = toViewBoxY(-halfVerticalGap - lineHeight);
      const topY1 = toViewBoxY(-halfVerticalGap);
      const bottomY0 = toViewBoxY(halfVerticalGap);
      const bottomY1 = toViewBoxY(halfVerticalGap + lineHeight);
      const rect = (x0, x1, y0, y1) => `M${x0},${y0} L${x1},${y0} L${x1},${y1} L${x0},${y1} Z`;

      return `<path d="${rect(0, leftX1, topY0, topY1)} ${rect(rightX0, rightX1, topY0, topY1)} ${rect(0, leftX1, bottomY0, bottomY1)} ${rect(rightX0, rightX1, bottomY0, bottomY1)}" fill="currentColor"/>`;
    }

    // 🬼 - lower left block diagonal lower middle left to lower centre (https://symbl.cc/en/1FB3C/)
    case 0x1fb3c:
      return (
        `<path d="M0,${twoThirds} L0,1 L0.5,1 Z" fill="currentColor"/>` +
        stroked(`M0,${twoThirds} L0,1 L0.5,1 Z`)
      );

    // 🬽 - lower left block diagonal lower middle left to lower right (https://symbl.cc/en/1FB3D/)
    case 0x1fb3d:
      return (
        `<path d="M0,${twoThirds} L0,1 L1,1 Z" fill="currentColor"/>` +
        stroked(`M0,${twoThirds} L0,1 L1,1 Z`)
      );

    // 🬾 - lower left block diagonal upper middle left to lower centre (https://symbl.cc/en/1FB3E/)
    case 0x1fb3e:
      return (
        `<path d="M0,${third} L0.5,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L0.5,1 L0,1 Z`)
      );

    // 🬿 - lower left block diagonal upper middle left to lower right (https://symbl.cc/en/1FB3F/)
    case 0x1fb3f:
      return (
        `<path d="M0,${third} L1,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L1,1 L0,1 Z`)
      );

    // 🭀 - lower left block diagonal upper left to lower centre (https://symbl.cc/en/1FB40/)
    case 0x1fb40:
      return '<path d="M0,0 L0.5,1 L0,1 Z" fill="currentColor"/>' + stroked("M0,0 L0.5,1 L0,1 Z");

    // 🭁 - lower right block diagonal upper middle left to upper centre (https://symbl.cc/en/1FB41/)
    case 0x1fb41:
      return (
        `<path d="M0,${third} L0,1 L1,1 L1,0 L0.5,0 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L0,1 L1,1 L1,0 L0.5,0 Z`)
      );

    // 🭂 - lower right block diagonal upper middle left to upper right (https://symbl.cc/en/1FB42/)
    case 0x1fb42:
      return (
        `<path d="M0,${third} L0,1 L1,1 L1,0 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L0,1 L1,1 L1,0 Z`)
      );

    // 🭃 - lower right block diagonal lower middle left to upper centre (https://symbl.cc/en/1FB43/)
    case 0x1fb43:
      return (
        `<path d="M0,${twoThirds} L0,1 L1,1 L1,0 L0.5,0 Z" fill="currentColor"/>` +
        stroked(`M0,${twoThirds} L0,1 L1,1 L1,0 L0.5,0 Z`)
      );

    // 🭄 - lower right block diagonal lower middle left to upper right (https://symbl.cc/en/1FB44/)
    case 0x1fb44:
      return (
        `<path d="M0,${twoThirds} L0,1 L1,1 L1,0 Z" fill="currentColor"/>` +
        stroked(`M0,${twoThirds} L0,1 L1,1 L1,0 Z`)
      );

    // 🭅 - lower right block diagonal lower left to upper centre (https://symbl.cc/en/1FB45/)
    case 0x1fb45:
      return (
        '<path d="M0.5,0 L1,0 L1,1 L0,1 Z" fill="currentColor"/>' +
        stroked("M0.5,0 L1,0 L1,1 L0,1 Z")
      );

    // 🭆 - lower right block diagonal lower middle left to upper middle right (https://symbl.cc/en/1FB46/)
    case 0x1fb46:
      return (
        `<path d="M0,${twoThirds} L0,1 L1,1 L1,${third} Z" fill="currentColor"/>` +
        stroked(`M0,${twoThirds} L0,1 L1,1 L1,${third} Z`)
      );

    // 🭇 - lower right block diagonal lower centre to lower middle right (https://symbl.cc/en/1FB47/)
    case 0x1fb47:
      return (
        `<path d="M0.5,1 L1,1 L1,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0.5,1 L1,1 L1,${twoThirds} Z`)
      );

    // 🭈 - lower right block diagonal lower left to lower middle right (https://symbl.cc/en/1FB48/)
    case 0x1fb48:
      return (
        `<path d="M0,1 L1,1 L1,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0,1 L1,1 L1,${twoThirds} Z`)
      );

    // 🭉 - lower right block diagonal lower centre to upper middle right (https://symbl.cc/en/1FB49/)
    case 0x1fb49:
      return (
        `<path d="M0.5,1 L1,1 L1,${third} Z" fill="currentColor"/>` +
        stroked(`M0.5,1 L1,1 L1,${third} Z`)
      );

    // 🭊 - lower right block diagonal lower left to upper middle right (https://symbl.cc/en/1FB4A/)
    case 0x1fb4a:
      return (
        `<path d="M0,1 L1,1 L1,${third} Z" fill="currentColor"/>` +
        stroked(`M0,1 L1,1 L1,${third} Z`)
      );

    // 🭋 - lower right block diagonal lower centre to upper right (https://symbl.cc/en/1FB4B/)
    case 0x1fb4b:
      return '<path d="M0.5,1 L1,0 L1,1 Z" fill="currentColor"/>' + stroked("M0.5,1 L1,0 L1,1 Z");

    // 🭌 - lower left block diagonal upper centre to upper middle right (https://symbl.cc/en/1FB4C/)
    case 0x1fb4c:
      return (
        `<path d="M0,0 L0.5,0 L1,${third} L1,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,0 L0.5,0 L1,${third} L1,1 L0,1 Z`)
      );

    // 🭍 - lower left block diagonal upper left to upper middle right (https://symbl.cc/en/1FB4D/)
    case 0x1fb4d:
      return (
        `<path d="M0,0 L0,1 L1,1 L1,${third} Z" fill="currentColor"/>` +
        stroked(`M0,0 L0,1 L1,1 L1,${third} Z`)
      );

    // 🭎 - lower left block diagonal upper centre to lower middle right (https://symbl.cc/en/1FB4E/)
    case 0x1fb4e:
      return (
        `<path d="M0,0 L0.5,0 L1,${twoThirds} L1,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,0 L0.5,0 L1,${twoThirds} L1,1 L0,1 Z`)
      );

    // 🭏 - lower left block diagonal upper left to lower middle right (https://symbl.cc/en/1FB4F/)
    case 0x1fb4f:
      return (
        `<path d="M0,0 L1,${twoThirds} L1,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,${twoThirds} L1,1 L0,1 Z`)
      );

    // 🭐 - lower left block diagonal upper centre to lower right (https://symbl.cc/en/1FB50/)
    case 0x1fb50:
      return (
        '<path d="M0,0 L0.5,0 L1,1 L0,1 Z" fill="currentColor"/>' +
        stroked("M0,0 L0.5,0 L1,1 L0,1 Z")
      );

    // 🭑 - lower left block diagonal upper middle left to lower middle right (https://symbl.cc/en/1FB51/)
    case 0x1fb51:
      return (
        `<path d="M0,${third} L1,${twoThirds} L1,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L1,${twoThirds} L1,1 L0,1 Z`)
      );

    // 🭒 - upper right block diagonal lower middle left to lower centre (https://symbl.cc/en/1FB52/)
    case 0x1fb52:
      return (
        `<path d="M0,${twoThirds} L0,0 L1,0 L1,1 L0.5,1 Z" fill="currentColor"/>` +
        stroked(`M0,${twoThirds} L0,0 L1,0 L1,1 L0.5,1 Z`)
      );

    // 🭓 - upper right block diagonal lower middle left to lower right (https://symbl.cc/en/1FB53/)
    case 0x1fb53:
      return (
        `<path d="M0,${twoThirds} L0,0 L1,0 L1,1 Z" fill="currentColor"/>` +
        stroked(`M0,${twoThirds} L0,0 L1,0 L1,1 Z`)
      );

    // 🭔 - upper right block diagonal upper middle left to lower centre (https://symbl.cc/en/1FB54/)
    case 0x1fb54:
      return (
        `<path d="M0,${third} L0,0 L1,0 L1,1 L0.5,1 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L0,0 L1,0 L1,1 L0.5,1 Z`)
      );

    // 🭕 - upper right block diagonal upper middle left to lower right (https://symbl.cc/en/1FB55/)
    case 0x1fb55:
      return (
        `<path d="M0,${third} L0,0 L1,0 L1,1 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L0,0 L1,0 L1,1 Z`)
      );

    // 🭖 - upper right block diagonal upper left to lower centre (https://symbl.cc/en/1FB56/)
    case 0x1fb56:
      return (
        '<path d="M0,0 L1,0 L1,1 L0.5,1 Z" fill="currentColor"/>' +
        stroked("M0,0 L1,0 L1,1 L0.5,1 Z")
      );

    // 🭗 - upper left block diagonal upper middle left to upper centre (https://symbl.cc/en/1FB57/)
    case 0x1fb57:
      return (
        `<path d="M0,${third} L0.5,0 L0,0 Z" fill="currentColor"/>` +
        stroked(`M0,${third} L0.5,0 L0,0 Z`)
      );

    // 🭘 - upper left block diagonal upper middle left to upper right (https://symbl.cc/en/1FB58/)
    case 0x1fb58:
      return (
        `<path d="M0,0 L1,0 L0,${third} Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L0,${third} Z`)
      );

    // 🭙 - upper left block diagonal lower middle left to upper centre (https://symbl.cc/en/1FB59/)
    case 0x1fb59:
      return (
        `<path d="M0,0 L0.5,0 L0,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0,0 L0.5,0 L0,${twoThirds} Z`)
      );

    // 🭚 - upper left block diagonal lower middle left to upper right (https://symbl.cc/en/1FB5A/)
    case 0x1fb5a:
      return (
        `<path d="M0,0 L1,0 L0,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L0,${twoThirds} Z`)
      );

    // 🭛 - upper left block diagonal lower left to upper centre (https://symbl.cc/en/1FB5B/)
    case 0x1fb5b:
      return '<path d="M0,0 L0.5,0 L0,1 Z" fill="currentColor"/>' + stroked("M0,0 L0.5,0 L0,1 Z");

    // 🭜 - upper left block diagonal lower middle left to upper middle right (https://symbl.cc/en/1FB5C/)
    case 0x1fb5c:
      return (
        `<path d="M0,0 L1,0 L1,${third} L0,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L1,${third} L0,${twoThirds} Z`)
      );

    // 🭝 - upper left block diagonal lower centre to lower middle right (https://symbl.cc/en/1FB5D/)
    case 0x1fb5d:
      return (
        `<path d="M0,0 L1,0 L1,${twoThirds} L0.5,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L1,${twoThirds} L0.5,1 L0,1 Z`)
      );

    // 🭞 - upper left block diagonal lower left to lower middle right (https://symbl.cc/en/1FB5E/)
    case 0x1fb5e:
      return (
        `<path d="M0,0 L1,0 L1,${twoThirds} L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L1,${twoThirds} L0,1 Z`)
      );

    // 🭟 - upper left block diagonal lower centre to upper middle right (https://symbl.cc/en/1FB5F/)
    case 0x1fb5f:
      return (
        `<path d="M0,0 L1,0 L1,${third} L0.5,1 L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L1,${third} L0.5,1 L0,1 Z`)
      );

    // 🭠 - upper left block diagonal lower left to upper middle right (https://symbl.cc/en/1FB60/)
    case 0x1fb60:
      return (
        `<path d="M0,0 L1,0 L1,${third} L0,1 Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L1,${third} L0,1 Z`)
      );

    // 🭡 - upper left block diagonal lower centre to upper right (https://symbl.cc/en/1FB61/)
    case 0x1fb61:
      return (
        '<path d="M0,0 L1,0 L0.5,1 L0,1 Z" fill="currentColor"/>' +
        stroked("M0,0 L1,0 L0.5,1 L0,1 Z")
      );

    // 🭢 - upper right block diagonal upper centre to upper middle right (https://symbl.cc/en/1FB62/)
    case 0x1fb62:
      return (
        `<path d="M0.5,0 L1,0 L1,${third} Z" fill="currentColor"/>` +
        stroked(`M0.5,0 L1,0 L1,${third} Z`)
      );

    // 🭣 - upper right block diagonal upper left to upper middle right (https://symbl.cc/en/1FB63/)
    case 0x1fb63:
      return (
        `<path d="M0,0 L1,0 L1,${third} Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L1,${third} Z`)
      );

    // 🭤 - upper right block diagonal upper centre to lower middle right (https://symbl.cc/en/1FB64/)
    case 0x1fb64:
      return (
        `<path d="M0.5,0 L1,0 L1,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0.5,0 L1,0 L1,${twoThirds} Z`)
      );

    // 🭥 - upper right block diagonal upper left to lower middle right (https://symbl.cc/en/1FB65/)
    case 0x1fb65:
      return (
        `<path d="M0,0 L1,0 L1,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0,0 L1,0 L1,${twoThirds} Z`)
      );

    // 🭦 - upper right block diagonal upper centre to lower right (https://symbl.cc/en/1FB66/)
    case 0x1fb66:
      return '<path d="M0.5,0 L1,0 L1,1 Z" fill="currentColor"/>' + stroked("M0.5,0 L1,0 L1,1 Z");

    // 🭧 - upper right block diagonal upper middle left to lower middle right (https://symbl.cc/en/1FB67/)
    case 0x1fb67:
      return (
        `<path d="M0,${third} L0,0 L1,0 L1,${twoThirds} Z" fill="currentColor"/>` +
        stroked(`M0,${third} L0,0 L1,0 L1,${twoThirds} Z`)
      );

    // 🭨 - upper and right and lower triangular three quarters block (https://symbl.cc/en/1FB68/)
    case 0x1fb68:
      return (
        '<path fill-rule="evenodd" d="M0,0 L1,0 L1,1 L0,1 Z M0,0 L0,1 L0.5,0.5 Z" fill="currentColor"/>' +
        `<path d="M0,0 L1,0 M0,1 L1,1 M1,0 L1,1" fill="none" ${stroke}/>` +
        `<path d="M0,0 L0.5,0.5 M0,1 L0.5,0.5" fill="none" ${strokeButt}/>`
      );

    // 🭩 - left and lower and right triangular three quarters block (https://symbl.cc/en/1FB69/)
    case 0x1fb69:
      return (
        '<path fill-rule="evenodd" d="M0,0 L1,0 L1,1 L0,1 Z M0,0 L1,0 L0.5,0.5 Z" fill="currentColor"/>' +
        `<path d="M0,0 L0,1 M1,0 L1,1 M0,1 L1,1" fill="none" ${stroke}/>` +
        `<path d="M0,0 L0.5,0.5 M1,0 L0.5,0.5" fill="none" ${strokeButt}/>`
      );

    // 🭪 - upper and left and lower triangular three quarters block (https://symbl.cc/en/1FB6A/)
    case 0x1fb6a:
      return (
        '<path fill-rule="evenodd" d="M0,0 L1,0 L1,1 L0,1 Z M1,0 L1,1 L0.5,0.5 Z" fill="currentColor"/>' +
        `<path d="M0,0 L1,0 M0,1 L1,1 M0,0 L0,1" fill="none" ${stroke}/>` +
        `<path d="M1,0 L0.5,0.5 M1,1 L0.5,0.5" fill="none" ${strokeButt}/>`
      );

    // 🭫 - left and upper and right triangular three quarters block (https://symbl.cc/en/1FB6B/)
    case 0x1fb6b:
      return (
        '<path fill-rule="evenodd" d="M0,0 L1,0 L1,1 L0,1 Z M0,1 L1,1 L0.5,0.5 Z" fill="currentColor"/>' +
        `<path d="M0,0 L1,0 M0,0 L0,1 M1,0 L1,1" fill="none" ${stroke}/>` +
        `<path d="M0,1 L0.5,0.5 M1,1 L0.5,0.5" fill="none" ${strokeButt}/>`
      );

    // 🭬 - left triangular one quarter block (https://symbl.cc/en/1FB6C/)
    case 0x1fb6c:
      return (
        '<path d="M0,0 L0,1 L0.5,0.5 Z" fill="currentColor"/>' + stroked("M0,0 L0,1 L0.5,0.5 Z")
      );

    // powerline right full triangle (https://www.nerdfonts.com/cheat-sheet)
    case 0xe0b0:
      return '<path d="M0,0 L1,0.5 L0,1 Z" fill="currentColor"/>';

    // powerline right bracket (https://www.nerdfonts.com/cheat-sheet)
    case 0xe0b1:
      return '<path d="M0,0 L1,0.5 L0,1" fill="none" stroke="currentColor" stroke-width="0.07" stroke-linejoin="miter"/>';

    // powerline left full triangle (https://www.nerdfonts.com/cheat-sheet)
    case 0xe0b2:
      return '<path d="M1,0 L0,0.5 L1,1 Z" fill="currentColor"/>';

    // powerline left bracket (https://www.nerdfonts.com/cheat-sheet)
    case 0xe0b3:
      return '<path d="M1,0 L0,0.5 L1,1" fill="none" stroke="currentColor" stroke-width="0.07" stroke-linejoin="miter"/>';

    default:
      return null;
  }
}

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
