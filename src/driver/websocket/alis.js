function alisHandler(logger) {
  const outputDecoder = new TextDecoder();
  const inputDecoder = new TextDecoder();
  let handler = parseMagicString;

  function parseMagicString(buffer) {
    const text = (new TextDecoder()).decode(buffer);

    if (text === "ALiS\x01") {
      handler = parseInitFrame;
    } else {
      throw "not an ALiS v1 live stream";
    }
  }

  function parseInitFrame(buffer) {
    const view = new DataView(buffer);
    const type = view.getUint8(0);

    if (type !== 0x01) throw `expected init (0x01) frame, got ${type}`;

    let offset = 1;
    const time = Number(view.getBigUint64(offset, true)) / 1000000;
    offset += 8;
    const cols = view.getUint16(offset, true);
    offset += 2;
    const rows = view.getUint16(offset, true);
    offset += 2;
    const themeFormat = view.getUint8(offset);
    offset += 1;
    let theme;

    if (themeFormat === 8) {
      const len = (2 + 8) * 3;
      theme = parseTheme(new Uint8Array(buffer, offset, len));
      offset += len;
    } else if (themeFormat === 16) {
      const len = (2 + 16) * 3;
      theme = parseTheme(new Uint8Array(buffer, offset, len));
      offset += len;
    } else if (themeFormat !== 0) {
      logger.warn(`alis: unsupported theme format (${themeFormat})`);
      socket.close();
      return;
    }

    const initLen = view.getUint32(offset, true);
    offset += 4;

    let init;

    if (initLen > 0) {
      init = outputDecoder.decode(new Uint8Array(buffer, offset, initLen));
      offset += initLen;
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
    const view = new DataView(buffer);
    const type = view.getUint8(0);

    if (type === 0x6f) {
      // 'o' - output
      const time = Number(view.getBigUint64(1, true)) / 1000000;
      const len = view.getUint32(9, true);
      const text = outputDecoder.decode(new Uint8Array(buffer, 13, len));

      return [time, "o", text];
    } else if (type === 0x69) {
      // 'i' - input
      const time = Number(view.getBigUint64(1, true)) / 1000000;
      const len = view.getUint32(9, true);
      const text = inputDecoder.decode(new Uint8Array(buffer, 13, len));

      return [time, "i", text];
    } else if (type === 0x72) {
      // 'r' - resize
      const time = Number(view.getBigUint64(1, true)) / 1000000;
      const cols = view.getUint16(9, true);
      const rows = view.getUint16(11, true);

      return [time, "r", { cols, rows }];
    } else if (type === 0x6d) {
      // 'm' - marker
      const time = Number(view.getBigUint64(1, true)) / 1000000;
      const len = view.getUint32(9, true);
      const decoder = new TextDecoder();
      const text = decoder.decode(new Uint8Array(buffer, 13, len));

      return [time, "m", text];
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

export { alisHandler };
