function ascicastV3Handler() {
  let parse = parseHeader;
  let currentTime = 0;

  function parseHeader(buffer) {
    const header = JSON.parse(buffer);

    if (header.version !== 3) {
      throw new Error("not an asciicast v3 stream");
    }

    parse = parseEvent;

    const term = {
      size: {
        cols: header.term.cols,
        rows: header.term.rows
      }
    };

    if (header.term.theme) {
      term.theme = {
        foreground: header.term.theme.fg,
        background: header.term.theme.bg,
        palette: header.term.theme.palette.split(":")
      };
    }

    return { time: 0.0, term };
  }

  function parseEvent(buffer) {
    const event = JSON.parse(buffer);
    const [interval, eventType, data] = event;
    currentTime += interval;

    if (eventType === "r") {
      const [cols, rows] = data.split("x");
      return [currentTime, "r", { cols: parseInt(cols, 10), rows: parseInt(rows, 10) }];
    } else {
      return [currentTime, eventType, data];
    }
  }

  return function(buffer) {
    return parse(buffer);
  };
}

export { ascicastV3Handler };
