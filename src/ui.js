import { mount } from "./view";
import { coreOpts, uiOpts } from "./opts";
import { DummyLogger } from "./logging";
import { fromErrorPayload } from "./error";

function create(src, elem, workerUrl, opts = {}) {
  const coreLogger = opts.logger === console ? true : undefined;
  const core = new CoreWorkerProxy(workerUrl, src, coreOpts(opts, { logger: coreLogger }));
  const uiLogger = opts.logger ?? new DummyLogger();
  const { el, dispose } = mount(
    core,
    elem,
    uiOpts(opts, {
      logger: uiLogger,
      onTerminalReady: () => core.terminalReady(),
    }),
  );

  const ready = core.init();
  void ready.catch(() => {});

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

class CoreWorkerProxy {
  constructor(workerUrl, src, opts) {
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = this._onMessage.bind(this);
    this.nextId = 1;

    this.eventHandlers = new Map([
      ["ended", []],
      ["error", []],
      ["input", []],
      ["loading", []],
      ["marker", []],
      ["metadata", []],
      ["offline", []],
      ["output", []],
      ["pause", []],
      ["play", []],
      ["playing", []],
      ["ready", []],
      ["reset", []],
      ["resize", []],
      ["seeked", []],
    ]);

    this.pending = new Map();
    this._sendCommand("new", [src, opts]);
  }

  async init() {
    return this._sendCommand("init");
  }

  play() {
    return this._sendCommand('play');
  }

  pause() {
    return this._sendCommand('pause');
  }

  togglePlay() {
    return this._sendCommand('togglePlay');
  }

  seek(where) {
    return this._sendCommand('seek', where);
  }

  step(n) {
    return this._sendCommand('step', n);
  }

  stop() {
    return this._sendCommand('stop');
  }

  terminalReady() {
    this._sendNotification("terminalReady");
  }

  getChanges() {
    return this._sendCommand('getChanges');
  }

  getCurrentTime() {
    return this._sendCommand('getCurrentTime');
  }

  getRemainingTime() {
    return this._sendCommand('getRemainingTime');
  }

  getProgress() {
    return this._sendCommand('getProgress');
  }

  getDuration() {
    return this._sendCommand('getDuration');
  }

  addEventListener(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName);

    if (handlers.length === 0) {
      this._sendNotification("addEventListener", [eventName]);
    }

    handlers.push(handler);
  }

  _dispatchEvent(eventName, data = {}) {
    for (const h of this.eventHandlers.get(eventName)) {
      h(data);
    }
  }

  _sendCommand(name, args) {
    let resolve_;
    let reject_;

    const promise = new Promise((resolve, reject) => {
      resolve_ = resolve;
      reject_ = reject;
    });

    this.pending.set(this.nextId, { resolve: resolve_, reject: reject_ });
    this.worker.postMessage({ method: name, params: args, id: this.nextId });
    this.nextId++;

    return promise;
  }

  _sendNotification(name, args) {
    this.worker.postMessage({ method: name, params: args });
  }

  _onMessage(e) {
    if (e.data.id !== undefined) {
      const pending = this.pending.get(e.data.id);

      if (pending) {
        if (e.data.error !== undefined) {
          pending.reject(fromErrorPayload(e.data.error));
        } else {
          pending.resolve(e.data.result);
        }

        this.pending.delete(e.data.id);
      }
    } else if (e.data.method === "onEvent") {
      this._dispatchEvent(e.data.params.name, e.data.params.event);
    }
  }
}

export { create };
