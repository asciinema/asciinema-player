function ascicastV2Handler() {
  let parse = parseHeader;

  function parseHeader(buffer) {
    const header = JSON.parse(buffer);

    if (header.version !== 2) {
      throw "not an asciicast v2 stream";
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

    if (event[1] === "r") {
      const [cols, rows] = event[2].split("x");
      return [event[0], "r", { cols: parseInt(cols, 10), rows: parseInt(rows, 10) }];
    } else {
      return event;
    }
  }

  return function(buffer) {
    return parse(buffer);
  };
}

export { ascicastV2Handler };
