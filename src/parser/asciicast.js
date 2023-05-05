import Stream from '../stream';


async function parse(data) {
  let header;
  let events;

  if (data instanceof Response) {
    const text = await data.text();
    const result = parseJsonl(text);

    if (result !== undefined) {
      header = result.header;
      events = result.events;
    } else {
      header = JSON.parse(text);
    }
  } else if (typeof data === 'object' && typeof data.version === 'number') {
    header = data;
  } else if (Array.isArray(data)) {
    header = data[0];
    events = data.slice(1, data.length);
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
    .map(JSON.parse)
    .toArray();

  return { header, events };
}

function parseAsciicastV1(data) {
  let time = 0;

  const output = new Stream(data.stdout).map(e => {
    time += e[0];
    return [time, e[1]];
  });

  return {
    cols: data.width,
    rows: data.height,
    output
  }
}

function parseAsciicastV2(header, events) {
  return {
    cols: header.width,
    rows: header.height,
    output: (new Stream(events)).filter(e => e[1] === 'o').map(e => [e[0], e[2]]),
    input: (new Stream(events)).filter(e => e[1] === 'i').map(e => [e[0], e[2]]),
    markers: (new Stream(events)).filter(e => e[1] === 'm').map(e => [e[0], e[2]]),
    idleTimeLimit: header.idle_time_limit
  }
}

function unparseAsciicastV2(recording) {
  const header = JSON.stringify({
    version: 2,
    width: recording.cols,
    height: recording.rows,
  })

  const events = recording.output
    .map(e => JSON.stringify([e[0], 'o', e[1]]))
    .join('\n');

  return `${header}\n${events}\n`;
}

export default parse;
export { parse, unparseAsciicastV2 };
