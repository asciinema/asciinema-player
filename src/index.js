import Core from "./core";
import { mount } from "./view";
import { coreOpts, uiOpts } from "./opts";
import { DummyLogger } from "./logging";

function create(src, elem, opts = {}) {
  const logger = opts.logger ?? new DummyLogger();
  const core = new Core(src, coreOpts(opts, { logger }));
  return mount(core, elem, uiOpts(opts, { logger }));
}

export { create };
