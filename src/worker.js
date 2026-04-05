import Core from "./core";
import { DummyLogger } from "./logging";
import { toErrorPayload } from "./error";

let logger = new DummyLogger();
let core;

onmessage = async function(e) {
  if (e.data.id !== undefined) {
    try {
      const result = await invoke(e.data.method, e.data.params);
      postMessage({ result, id: e.data.id });
    } catch (error) {
      postMessage({ error: toErrorPayload(error), id: e.data.id });
    }
  } else {
    await invoke(e.data.method, e.data.params);
  }
};

function invoke(method, params) {
  switch (method) {
    case "getChanges":
      return core.getChanges();
    case "new":
      const opts = params[1];

      if (opts.logger === true) {
        logger = console;
      }

      opts.logger = logger;
      core = new Core(params[0], opts);
      return;
    case "init":
      return core.init();
    case "terminalReady":
      return core.terminalReady();
    case "play":
      return core.play();
    case "pause":
      return core.pause();
    case "stop":
      return core.stop();
    case "seek":
      return core.seek(params);
    case "step":
      return core.step(params);
    case "getCurrentTime":
      return core.getCurrentTime();
    case "getRemainingTime":
      return core.getRemainingTime();
    case "getProgress":
      return core.getProgress();
    case "addEventListener":
      core.addEventListener(params[0], (e) => {
        postMessage({ method: "onEvent", params: { name: params[0], event: e } });
      });
      return;
    default:
      throw new Error(`invalid method ${method}`);
  }
}
