import Core from "./core";
import { mount } from "./view";
import { coreOpts, uiOpts } from "./opts";
import { DummyLogger } from "./logging";

function create(src, elem, opts = {}) {
  const logger = opts.logger ?? new DummyLogger();
  const core = new Core(src, coreOpts(opts, { logger }));
  const { el, dispose } = mount(core, elem, uiOpts(opts, { logger }));

  const player = {
    el,
    dispose,
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

export { create };
