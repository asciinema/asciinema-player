async function parse(responses, { encoding }) {
  const textDecoder = new TextDecoder(encoding);
  let cols;
  let rows;

  let timing = (await responses[0].text())
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(" "));

  if (timing[0].length < 3) {
    timing = timing.map((entry) => ["O", entry[0], entry[1]]);
  }

  const buffer = await responses[1].arrayBuffer();
  const array = new Uint8Array(buffer);
  const dataOffset = array.findIndex((byte) => byte == 0x0a) + 1;
  const header = textDecoder.decode(array.subarray(0, dataOffset));
  const sizeMatch = header.match(/COLUMNS="(\d+)" LINES="(\d+)"/);

  if (sizeMatch !== null) {
    cols = parseInt(sizeMatch[1], 10);
    rows = parseInt(sizeMatch[2], 10);
  }

  const stdout = { array, cursor: dataOffset };
  let stdin = stdout;

  if (responses[2] !== undefined) {
    const buffer = await responses[2].arrayBuffer();
    const array = new Uint8Array(buffer);
    stdin = { array, cursor: dataOffset };
  }

  const events = [];
  let time = 0;

  for (const entry of timing) {
    time += parseFloat(entry[1]);

    if (entry[0] === "O") {
      const count = parseInt(entry[2], 10);
      const bytes = stdout.array.subarray(stdout.cursor, stdout.cursor + count);
      const text = textDecoder.decode(bytes);
      events.push([time, "o", text]);
      stdout.cursor += count;
    } else if (entry[0] === "I") {
      const count = parseInt(entry[2], 10);
      const bytes = stdin.array.subarray(stdin.cursor, stdin.cursor + count);
      const text = textDecoder.decode(bytes);
      events.push([time, "i", text]);
      stdin.cursor += count;
    } else if (entry[0] === "S" && entry[2] === "SIGWINCH") {
      const cols = parseInt(entry[4].slice(5), 10);
      const rows = parseInt(entry[3].slice(5), 10);
      events.push([time, "r", `${cols}x${rows}`]);
    } else if (entry[0] === "H" && entry[2] === "COLUMNS") {
      cols = parseInt(entry[3], 10);
    } else if (entry[0] === "H" && entry[2] === "LINES") {
      rows = parseInt(entry[3], 10);
    }
  }

  cols = cols ?? 80;
  rows = rows ?? 24;

  return { cols, rows, events };
}

export default parse;
