import { mount } from "./view";
import { coreOpts, uiOpts } from "./opts";
import { DummyLogger } from "./logging";

function create(src, elem, workerUrl, opts = {}) {
  const coreLogger = opts.logger === console ? true : undefined;
  const core = new CoreWorkerProxy(workerUrl, src, coreOpts(opts, { logger: coreLogger }));
  const uiLogger = opts.logger ?? new DummyLogger();
  const { el, dispose } =  mount(core, elem, uiOpts(opts, { logger: uiLogger }));

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

class CoreWorkerProxy {
  constructor(workerUrl, src, opts) {
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = this._onMessage.bind(this);
    this.nextId = 1;

    this.eventHandlers = new Map([
      ["ended", []],
      ["errored", []],
      ["idle", []],
      ["init", []],
      ["input", []],
      ["loading", []],
      ["marker", []],
      ["offline", []],
      ["pause", []],
      ["play", []],
      ["playing", []],
      ["reset", []],
      ["resize", []],
      ["seeked", []],
      ["terminalUpdate", []],
    ]);

    this.resolves = new Map();
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

    const promise = new Promise((resolve) => {
      resolve_ = resolve;
    });

    this.resolves.set(this.nextId, resolve_);
    this.worker.postMessage({ method: name, params: args, id: this.nextId });
    this.nextId++;

    return promise;
  }

  _sendNotification(name, args) {
    this.worker.postMessage({ method: name, params: args });
  }

  _onMessage(e) {
    if (e.data.id !== undefined) {
      this.resolves.get(e.data.id)(e.data.result);
      this.resolves.delete(e.data.id);
    } else if (e.data.method === "onEvent") {
      this._dispatchEvent(e.data.params.name, e.data.params.event);
    }
  }
}

export { create };
