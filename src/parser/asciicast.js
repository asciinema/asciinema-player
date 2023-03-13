import Stream from '../stream';


function parseAsciicast(data) {
  let header;
  let events = new Stream([]);

  if (typeof data === 'string') {
    const result = parseJsonl(data);;

    if (result !== undefined) {
      header = result.header;
      events = result.events;
    } else {
      header = JSON.parse(data);
    }
  } else if (typeof data === 'object' && typeof data.version === 'number') {
    header = data;
  } else if (Array.isArray(data)) {
    header = data[0];
    events = (new Stream(data)).drop(1);
  } else {
    throw 'invalid data';
  }

  if (header.version === 1) {
    return parseAsciicastV1(header);
  } else if (header.version === 2) {
    return parseAsciicastV2(header, events);
  } else {
    throw `asciicast v${header.version} format not supported`;
  }
}

function parseJsonl(jsonl) {
  const lines = jsonl.split('\n');
  let header;

  try {
    header = JSON.parse(lines[0]);
  } catch (_error) {
    return;
  }

  const events = new Stream(lines)
    .drop(1)
    .filter(l => l[0] === '[')
    .map(l => JSON.parse(l));

  return { header, events };
}

function parseAsciicastV1(data) {
  let time = 0;

  const frames = new Stream(data.stdout).map(e => {
    time += e[0];
    return [time, e[1]];
  });

  return {
    cols: data.width,
    rows: data.height,
    frames: frames
  }
}

function parseAsciicastV2(header, events) {
  const frames = events
    .filter(e => e[1] === 'o')
    .map(e => [e[0], e[2]]);

  return {
    cols: header.width,
    rows: header.height,
    idleTimeLimit: header.idle_time_limit,
    frames: frames
  }
}

export { parseAsciicast };
