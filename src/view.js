import { render } from "solid-js/web";
import Player from "./components/Player";

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
    adaptivePalette: opts.adaptivePalette,
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

  const playerDiv = document.createElement("div");
  playerDiv.className = "ap-default-term-ff";
  playerDiv.style.height = "0px";
  playerDiv.style.overflow = "hidden";
  playerDiv.style.fontSize = "15px"; // must match font-size of div.asciinema-player in CSS

  if (fontFamily !== undefined) {
    playerDiv.style.setProperty("--term-font-family", fontFamily);
  }

  const termDiv = document.createElement("div");
  termDiv.className = "ap-term";
  termDiv.style.width = `${cols}ch`;
  termDiv.style.height = `${rows * (lineHeight ?? 1.3333333333)}em`;
  termDiv.style.fontSize = "100%";

  playerDiv.appendChild(termDiv);
  document.body.appendChild(playerDiv);

  const metrics = {
    charW: termDiv.clientWidth / cols,
    charH: termDiv.clientHeight / rows,
    bordersW: termDiv.offsetWidth - termDiv.clientWidth,
    bordersH: termDiv.offsetHeight - termDiv.clientHeight,
  };

  document.body.removeChild(playerDiv);

  return metrics;
}

export { mount };
