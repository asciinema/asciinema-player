function jsonHandler(buffer) {
  const header = JSON.parse(buffer);

  if (header.version !== 2) {
    throw "not an asciicast v2 stream";
  }

  const meta = { cols: header.width, rows: header.height, time: 0.0 };

  return { meta, handler: JSON.parse };
}

export { jsonHandler };
