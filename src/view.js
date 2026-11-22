import { render } from "solid-js/web";
import Player from "./components/Player";

function mount(core, elem, opts = {}) {
  const props = {
    core: core,
    logger: opts.logger,
    cols: opts.cols,
    rows: opts.rows,
    fit: opts.fit,
    controls: opts.controls,
    cursorMode: opts.cursorMode,
    keystrokeOverlay: opts.keystrokeOverlay,
    autoPlay: opts.autoPlay,
    boldIsBright: opts.boldIsBright,
    adaptivePalette: opts.adaptivePalette,
    terminalFontSize: opts.terminalFontSize,
    terminalFontFamily: opts.terminalFontFamily,
    terminalLineHeight: opts.terminalLineHeight,
    theme: opts.theme,
    onTerminalReady: opts.onTerminalReady,
  };

  let el;

  const dispose = render(() => {
    el = <Player {...props} />;
    return el;
  }, elem);

  return { el: el, dispose: dispose };
}

export { mount };
