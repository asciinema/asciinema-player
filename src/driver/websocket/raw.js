function rawHandler(buffer) {
  const outputDecoder = new TextDecoder();
  const text = outputDecoder.decode(buffer, { stream: true });
  const [cols, rows] = sizeFromResizeSeq(text) ?? sizeFromScriptStartMessage(text) ?? [80, 24];
  const meta = { cols, rows, time: 0.0, init: text };

  return {
    meta,

    handler: function(buffer) {
      return outputDecoder.decode(buffer, { stream: true });
    },
  }
}

function sizeFromResizeSeq(text) {
  const match = text.match(/\x1b\[8;(\d+);(\d+)t/);

  if (match !== null) {
    return [parseInt(match[2], 10), parseInt(match[1], 10)];
  }
}

function sizeFromScriptStartMessage(text) {
  const match = text.match(/\[.*COLUMNS="(\d{1,3})" LINES="(\d{1,3})".*\]/);

  if (match !== null) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }
}

export { rawHandler };
