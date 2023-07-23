async function parse(response, { encoding }) {
  const textDecoder = new TextDecoder(encoding);
  const buffer = await response.arrayBuffer();
  const array = new Uint8Array(buffer);
  const firstFrame = parseFrame(array);
  const baseTime = firstFrame.time;
  const firstFrameText = textDecoder.decode(firstFrame.data);
  const sizeMatch = firstFrameText.match(/\x1b\[8;(\d+);(\d+)t/);
  const events = [];
  let cols = 80;
  let rows = 24;

  if (sizeMatch !== null) {
    cols = parseInt(sizeMatch[2], 10);
    rows = parseInt(sizeMatch[1], 10);
  }

  let cursor = 0;
  let frame = parseFrame(array);

  while (frame !== undefined) {
    const time = frame.time - baseTime;
    const text = textDecoder.decode(frame.data);
    events.push([time, 'o', text]);
    cursor += frame.len;
    frame = parseFrame(array.subarray(cursor));
  }

  return { cols, rows, events };
}

function parseFrame(array) {
  if (array.length < 13) return;

  const time = parseTimestamp(array.subarray(0, 8));
  const len = parseNumber(array.subarray(8, 12));
  const data = array.subarray(12, 12 + len);

  return { time, data, len: len + 12 };
}

function parseNumber(array) {
  return array[0] + array[1] * 256 + array[2] * 256 * 256 + array[3] * 256 * 256 * 256; 
}

function parseTimestamp(array) {
  const sec = parseNumber(array.subarray(0, 4));
  const usec = parseNumber(array.subarray(4, 8));

  return sec + (usec / 1000000);
}

export default parse;
