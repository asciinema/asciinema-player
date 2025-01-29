import { render } from "solid-js/web";
import Core from "./core";
import Player from "./components/Player";
import Terminal from "./components/Terminal";
import { DummyLogger } from "./logging";

function create(src, elem, opts = {}) {
  const logger = opts.logger ?? new DummyLogger();

  const core = new Core(src, {
    logger: logger,
    cols: opts.cols,
    rows: opts.rows,
    loop: opts.loop,
    speed: opts.speed,
    preload: opts.preload,
    startAt: opts.startAt,
    poster: opts.poster,
    markers: opts.markers,
    pauseOnMarkers: opts.pauseOnMarkers,
    idleTimeLimit: opts.idleTimeLimit,
  });

  const metrics = measureTerminal(opts.terminalFontFamily, opts.terminalLineHeight);

  const props = {
    logger: logger,
    core: core,
    cols: opts.cols,
    rows: opts.rows,
    fit: opts.fit,
    controls: opts.controls ?? "auto",
    autoPlay: opts.autoPlay ?? opts.autoplay,
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

  const player = {
    el: el,
    dispose: dispose,
    getCurrentTime: () => core.getCurrentTime(),
    getDuration: () => core.getDuration(),
    play: () => core.play(),
    pause: () => core.pause(),
    seek: (pos) => core.seek(pos),
  };

  player.addEventListener = (name, callback) => {
    return core.addEventListener(name, callback.bind(player));
  };

  return player;
}

function measureTerminal(fontFamily, lineHeight) {
  const cols = 80;
  const rows = 24;
  const div = document.createElement("div");
  div.style.height = "0px";
  div.style.overflow = "hidden";
  div.style.fontSize = "15px"; // must match font-size of div.asciinema-player in CSS
  document.body.appendChild(div);
  let el;

  const dispose = render(() => {
    el = (
      <Terminal
        cols={cols}
        rows={rows}
        lineHeight={lineHeight}
        fontFamily={fontFamily}
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

export { create };
