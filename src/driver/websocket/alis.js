const ONE_SEC_IN_USEC = 1000000;

function alisHandler(logger) {
  const outputDecoder = new TextDecoder();
  const inputDecoder = new TextDecoder();
  let handler = parseMagicString;
  let lastEventTime;

  function parseMagicString(buffer) {
    const text = (new TextDecoder()).decode(buffer);

    if (text === "ALiS\x01") {
      handler = parseInitFrame;
    } else {
      throw "not an ALiS v1 live stream";
    }
  }

  function parseInitFrame(buffer) {
    const view = new DataViewReader(new DataView(buffer));
    const type = view.getUint8();

    if (type !== 0x01) throw `expected init (0x01) frame, got ${type}`;

    let time = decodeRelTime(view);
    lastEventTime = time;
    time = time / ONE_SEC_IN_USEC;
    const cols = view.getUint16();
    const rows = view.getUint16();
    const themeFormat = view.getUint8();
    let theme;

    if (themeFormat === 8) {
      const len = (2 + 8) * 3;
      theme = parseTheme(new Uint8Array(buffer, view.offset, len));
      view.forward(len);
    } else if (themeFormat === 16) {
      const len = (2 + 16) * 3;
      theme = parseTheme(new Uint8Array(buffer, view.offset, len));
      view.forward(len);
    } else if (themeFormat !== 0) {
      logger.warn(`alis: unsupported theme format (${themeFormat})`);
      socket.close();
      return;
    }

    const initLen = view.getUint32();

    let init;

    if (initLen > 0) {
      init = outputDecoder.decode(new Uint8Array(buffer, view.offset, initLen));
    }

    handler = parseEventFrame;

    return {
      time,
      term: {
        size: { cols, rows },
        theme,
        init
      }
    }
  }

  function parseEventFrame(buffer) {
    const view = new DataViewReader(new DataView(buffer));
    const type = view.getUint8();

    if (type === 0x6f) {
      // 'o' - output
      const relTime = decodeRelTime(view);
      lastEventTime += relTime;
      const len = view.getUint32();
      const text = outputDecoder.decode(new Uint8Array(buffer, view.offset, len));

      return [lastEventTime / ONE_SEC_IN_USEC, "o", text];
    } else if (type === 0x69) {
      // 'i' - input
      const relTime = decodeRelTime(view);
      lastEventTime += relTime;
      const len = view.getUint32();
      const text = inputDecoder.decode(new Uint8Array(buffer, view.offset, len));

      return [lastEventTime / ONE_SEC_IN_USEC, "i", text];
    } else if (type === 0x72) {
      // 'r' - resize
      const relTime = decodeRelTime(view);
      lastEventTime += relTime;
      const cols = view.getUint16();
      const rows = view.getUint16();

      return [lastEventTime / ONE_SEC_IN_USEC, "r", { cols, rows }];
    } else if (type === 0x6d) {
      // 'm' - marker
      const relTime = decodeRelTime(view);
      lastEventTime += relTime;
      const len = view.getUint32();
      const decoder = new TextDecoder();
      const text = decoder.decode(new Uint8Array(buffer, view.offset, len));

      return [lastEventTime / ONE_SEC_IN_USEC, "m", text];
    } else if (type === 0x04) {
      // EOT
      handler = parseInitFrame;
      return false;
    } else {
      logger.debug(`alis: unknown frame type: ${type}`);
    }
  }

  return function(buffer) {
    return handler(buffer);
  };
}

function decodeRelTime(view) {
  const size = view.getUint8();

  if (size === 1) {
    return view.getUint8();
  } else if (size === 2) {
    return view.getUint16();
  } else if (size === 4) {
    return view.getUint32();
  } else if (size === 8) {
    return Number(view.getBigUint64());
  } else {
    throw `alis: invalid relative time size: ${size}`;
  }
}

function parseTheme(arr) {
  const colorCount = arr.length / 3;
  const foreground = hexColor(arr[0], arr[1], arr[2]);
  const background = hexColor(arr[3], arr[4], arr[5]);
  const palette = [];

  for (let i = 2; i < colorCount; i++) {
    palette.push(hexColor(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]));
  }

  return { foreground, background, palette };
}

function hexColor(r, g, b) {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
}

function byteToHex(value) {
  return value.toString(16).padStart(2, "0");
}

class DataViewReader {
  constructor(inner, offset = 0) {
    this.inner = inner;
    this.offset = offset;
  }

  forward(delta) {
    this.offset += delta;
  }

  getUint8() {
    const value = this.inner.getUint8(this.offset);
    this.offset += 1;

    return value;
  }

  getUint16() {
    const value = this.inner.getUint16(this.offset, true);
    this.offset += 2;

    return value;
  }

  getUint32() {
    const value = this.inner.getUint32(this.offset, true);
    this.offset += 4;

    return value;
  }

  getBigUint64() {
    const value = this.inner.getBigUint64(this.offset, true);
    this.offset += 8;

    return value;
  }
}

export { alisHandler };
