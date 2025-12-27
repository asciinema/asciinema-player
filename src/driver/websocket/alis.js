const ONE_SEC_IN_USEC = 1000000;

function alisHandler(logger) {
  const outputDecoder = new TextDecoder();
  const inputDecoder = new TextDecoder();
  let handler = parseMagicString;
  let lastEventTime;
  let markerIndex = 0;

  function parseMagicString(buffer) {
    const text = (new TextDecoder()).decode(buffer);

    if (text === "ALiS\x01") {
      handler = parseFirstFrame;
    } else {
      throw new Error("not an ALiS v1 live stream");
    }
  }

  function parseFirstFrame(buffer) {
    const view = new BinaryReader(new DataView(buffer));
    const type = view.getUint8();

    if (type !== 0x01) throw new Error(`expected reset (0x01) frame, got ${type}`);

    return parseResetFrame(view, buffer);
  }

  function parseResetFrame(view, buffer) {
    let _lastId = view.decodeVarUint();
    let time = view.decodeVarUint();
    lastEventTime = time;
    time = time / ONE_SEC_IN_USEC;
    markerIndex = 0;
    const cols = view.decodeVarUint();
    const rows = view.decodeVarUint();
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
      throw new Error(`alis: invalid theme format (${themeFormat})`);
    }

    const initLen = view.decodeVarUint();

    let init;

    if (initLen > 0) {
      init = outputDecoder.decode(new Uint8Array(buffer, view.offset, initLen));
    }

    handler = parseFrame;

    return {
      time,
      term: {
        size: { cols, rows },
        theme,
        init
      }
    }
  }

  function parseFrame(buffer) {
    const view = new BinaryReader(new DataView(buffer));
    const type = view.getUint8();

    if (type === 0x01) {
      return parseResetFrame(view, buffer);
    } else if (type === 0x6f) {
      return parseOutputFrame(view, buffer);
    } else if (type === 0x69) {
      return parseInputFrame(view, buffer);
    } else if (type === 0x72) {
      return parseResizeFrame(view);
    } else if (type === 0x6d) {
      return parseMarkerFrame(view, buffer);
    } else if (type === 0x04) {
      // EOT
      handler = parseFirstFrame;
      return false;
    } else {
      logger.debug(`alis: unknown frame type: ${type}`);
    }
  }

  function parseOutputFrame(view, buffer) {
    let _id = view.decodeVarUint();
    const relTime = view.decodeVarUint();
    lastEventTime += relTime;
    const len = view.decodeVarUint();
    const text = outputDecoder.decode(new Uint8Array(buffer, view.offset, len));

    return [lastEventTime / ONE_SEC_IN_USEC, "o", text];
  }

  function parseInputFrame(view, buffer) {
    let _id = view.decodeVarUint();
    const relTime = view.decodeVarUint();
    lastEventTime += relTime;
    const len = view.decodeVarUint();
    const text = inputDecoder.decode(new Uint8Array(buffer, view.offset, len));

    return [lastEventTime / ONE_SEC_IN_USEC, "i", text];
  }

  function parseResizeFrame(view) {
    let _id = view.decodeVarUint();
    const relTime = view.decodeVarUint();
    lastEventTime += relTime;
    const cols = view.decodeVarUint();
    const rows = view.decodeVarUint();

    return [lastEventTime / ONE_SEC_IN_USEC, "r", { cols, rows }];
  }

  function parseMarkerFrame(view, buffer) {
    let _id = view.decodeVarUint();
    const relTime = view.decodeVarUint();
    lastEventTime += relTime;
    const len = view.decodeVarUint();
    const decoder = new TextDecoder();
    const index = markerIndex++;
    const time = lastEventTime / ONE_SEC_IN_USEC;
    const label = decoder.decode(new Uint8Array(buffer, view.offset, len));

    return [time, "m", { index, time, label}];
  }

  return function(buffer) {
    return handler(buffer);
  };
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

class BinaryReader {
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

  decodeVarUint() {
    let number = BigInt(0);
    let shift = BigInt(0);
    let byte = this.getUint8();

    while (byte > 127) {
      byte &= 127;
      number += (BigInt(byte) << shift);
      shift += BigInt(7);
      byte = this.getUint8();
    }

    number = number + (BigInt(byte) << shift);

    return Number(number);
  }
}

export { alisHandler };
