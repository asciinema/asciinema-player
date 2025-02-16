import Core from "./core";
import { mount } from "./view";
import { coreOpts, uiOpts } from "./opts";
import { DummyLogger } from "./logging";

function create(src, elem, opts = {}) {
  const logger = opts.logger ?? new DummyLogger();
  const core = new Core(src, coreOpts(opts, { logger }));
  const { el, dispose } = mount(core, elem, uiOpts(opts, { logger }));

  const ready = core.init();

  const player = {
    el,
    dispose,
    getCurrentTime: () => ready.then(core.getCurrentTime.bind(core)),
    getDuration: () => ready.then(core.getDuration.bind(core)),
    play: () => ready.then(core.play.bind(core)),
    pause: () => ready.then(core.pause.bind(core)),
    seek: (pos) => ready.then(() => core.seek(pos)),
  };

  player.addEventListener = (name, callback) => {
    return core.addEventListener(name, callback.bind(player));
  };

  return player;
}

export { create };
