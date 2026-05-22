function ascicastV2Handler() {
  let parse = parseHeader;

  function parseHeader(buffer) {
    const header = JSON.parse(buffer);

    if (header.version !== 2) {
      throw new Error("not an asciicast v2 stream");
    }

    parse = parseEvent;

    return {
      time: 0.0,
      term: {
        size: {
          cols: header.width,
          rows: header.height
        }
      }
    };
  }

  function parseEvent(buffer) {
    const event = JSON.parse(buffer);
    const time = event[0] * 1000;

    if (event[1] === "r") {
      const [cols, rows] = event[2].split("x");
      return [time, "r", { cols: parseInt(cols, 10), rows: parseInt(rows, 10) }];
    } else {
      return [time, event[1], event[2]];
    }
  }

  return function(buffer) {
    return parse(buffer);
  };
}

export { ascicastV2Handler };
