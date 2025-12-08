import { render } from "solid-js/web";
import Player from "./components/Player";
import Terminal from "./components/Terminal";

function mount(core, elem, opts = {}) {
  const metrics = measureTerminal(opts.terminalFontFamily, opts.terminalLineHeight);

  const props = {
    core: core,
    logger: opts.logger,
    cols: opts.cols,
    rows: opts.rows,
    fit: opts.fit,
    controls: opts.controls,
    autoPlay: opts.autoPlay,
    terminalFontSize: opts.terminalFontSize,
    terminalFontFamily: opts.terminalFontFamily,
    terminalLineHeight: opts.terminalLineHeight,
    theme: opts.theme,
    ...metrics,
  };

  let el;

  const dispose = render(() => {
    el = <Player {...props} />;
    return el;
  }, elem);

  return { el: el, dispose: dispose };
}

function measureTerminal(fontFamily, lineHeight) {
  const cols = 80;
  const rows = 24;
  const div = document.createElement("div");
  div.className = "ap-default-term-ff";
  div.style.height = "0px";
  div.style.overflow = "hidden";
  div.style.fontSize = "15px"; // must match font-size of div.asciinema-player in CSS

  if (fontFamily !== undefined) {
    div.style["--term-font-family"] = fontFamily;
  }

  document.body.appendChild(div);
  let el;

  const dispose = render(() => {
    el = (
      <Terminal
        cols={cols}
        rows={rows}
        lineHeight={lineHeight}
        lines={[]}
      />
    );
    return el;
  }, div);

  const metrics = {
    charW: el.clientWidth / cols,
    charH: el.clientHeight / rows,
    bordersW: el.offsetWidth - el.clientWidth,
    bordersH: el.offsetHeight - el.clientHeight,
  };

  dispose();
  document.body.removeChild(div);

  return metrics;
}

export { mount };
