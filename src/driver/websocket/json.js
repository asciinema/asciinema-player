function jsonHandler(buffer) {
  const header = JSON.parse(buffer);

  if (header.version !== 2) {
    throw "not an asciicast v2 stream";
  }

  const meta = { cols: header.width, rows: header.height, time: 0.0 };

  return {
    meta,

    handler: function(buffer) {
      const event = JSON.parse(buffer);

      if (event[1] === "r") {
        const [cols, rows] = event[2].split("x");
        return [event[0], "r", { cols, rows }];
      } else {
        return event;
      }
    }
  }
}

export { jsonHandler };
