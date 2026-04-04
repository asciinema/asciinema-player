import { init as initVt, module as vtWasmModule } from "./vt/Cargo.toml?custom";

const vt = initVt({ module: vtWasmModule }); // trigger async loading of wasm
const memory = vt.then(wasm => wasm.default()).then(d => d.memory);

class Vt {
  static async build(cols, rows, boldIsBright, logger) {
    return new Vt(await vt, await memory, logger, cols, rows, boldIsBright);
  }

  constructor(wasm, memory, logger, cols, rows, boldIsBright) {
    this.wasm = wasm;
    this.memory = memory;
    this.logger = logger;
    this.cols = cols;
    this.rows = rows;
    this.boldIsBright = boldIsBright;
    this.vt = wasm.create(cols, rows, 100, boldIsBright);
  }

  feed(data) {
    return this.vt.feed(data);
  }

  reset(cols, rows, init = undefined) {
    this.logger.debug(`vt: reset (${cols}x${rows})`);
    this.vt = this.wasm.create(cols, rows, 100, this.boldIsBright);
    this.cols = cols;
    this.rows = rows;

    if (init !== undefined && init !== "") {
      this.vt.feed(init);
    }

    return Array.from({ length: rows }, (_, i) => i);
  }

  resize(cols, rows) {
    if (cols === this.cols && rows === this.rows) return;
    this.logger.debug(`vt: resize (${cols}x${rows})`);
    const changedRows = this.vt.resize(cols, rows);
    this.cols = cols;
    this.rows = rows;

    return changedRows;
  }

  getLine(n, cursorOn) {
    return this.vt.getLine(n, cursorOn);
  }

  getDataView([ptr, len], size) {
    return new DataView(this.memory.buffer, ptr, len * size);
  }

  getUint32Array([ptr, len]) {
    return new Uint32Array(this.memory.buffer, ptr, len);
  }

  getCursor() {
    const cursor = this.vt.getCursor();

    if (cursor) {
      return { col: cursor[0], row: cursor[1], visible: true };
    }

    return { col: 0, row: 0, visible: false };
  }
}

export { Vt };
