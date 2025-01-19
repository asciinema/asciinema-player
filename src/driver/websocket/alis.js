function alisHandler(buffer) {
  const outputDecoder = new TextDecoder();
  const inputDecoder = new TextDecoder();
  const arr = new Uint8Array(buffer);

  if (!(arr[0] == 0x41 && arr[1] == 0x4c && arr[2] == 0x69 && arr[3] == 0x53 && arr[4] === 1)) {
    // not 'ALiS\x01'
    throw "not an ALiS v1 live stream";
  }

  const view = new DataView(buffer);
  let offset = 5;
  const cols = view.getUint16(offset, true);
  offset += 2;
  const rows = view.getUint16(offset, true);
  offset += 2;
  const time = view.getFloat32(offset, true);
  offset += 4;
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
    logger.warn(`unsupported theme format (${themeFormat})`);
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

  const meta = { cols, rows, time, init, theme };

  return {
    meta,

    handler: function(buffer) {
      const view = new DataView(buffer);
      const type = view.getUint8(0);

      if (type === 0x6f) {
        // 'o' - output
        const time = view.getFloat32(1, true);
        const len = view.getUint32(5, true);
        const text = outputDecoder.decode(new Uint8Array(buffer, 9, len));

        return [time, "o", text];
      } else if (type === 0x69) {
        // 'i' - input
        const time = view.getFloat32(1, true);
        const len = view.getUint32(5, true);
        const text = inputDecoder.decode(new Uint8Array(buffer, 9, len));

        return [time, "i", text];
      } else if (type === 0x72) {
        // 'r' - resize
        const time = view.getFloat32(1, true);
        const cols = view.getUint16(5, true);
        const rows = view.getUint16(7, true);

        return [time, "r", { cols, rows }];
      } else if (type === 0x6d) {
        // 'm' - marker
        const time = view.getFloat32(1, true);
        const len = view.getUint32(5, true);
        const decoder = new TextDecoder();
        const text = decoder.decode(new Uint8Array(buffer, 9, len));

        return [time, "m", text];
      } else if (type === 0x04) {
        // offline (EOT)
        return false; // go offline
      } else {
        logger.debug(`unknown event type: ${type}`);
      }
    },
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
