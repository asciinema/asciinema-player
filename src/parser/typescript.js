async function parse(responses, { encoding }) {
  const textDecoder = new TextDecoder(encoding);
  let cols;
  let rows;

  let timing = (await responses[0].text())
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => line.split(' '));

  if (timing[0].length < 3) {
    timing = timing.map(entry => ['O', entry[0], entry[1]]);
  }

  const buffer = await responses[1].arrayBuffer();
  const array = new Uint8Array(buffer);
  const dataOffset = array.findIndex(byte => byte == 0x0a) + 1;
  const header = textDecoder.decode(array.slice(0, dataOffset));
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

  const output = [];
  const input = [];
  let time = 0;

  for (const entry of timing) {
    time += parseFloat(entry[1]);

    if (entry[0] === 'O') {
      const count = parseInt(entry[2], 10);
      const bytes = stdout.array.slice(stdout.cursor, stdout.cursor + count);
      const text = textDecoder.decode(bytes);
      output.push([time, text]);
      stdout.cursor += count;
    } else if (entry[0] === 'I') {
      const count = parseInt(entry[2], 10);
      const bytes = stdin.array.slice(stdin.cursor, stdin.cursor + count);
      const text = textDecoder.decode(bytes);
      input.push([time, text]);
      stdin.cursor += count;
    } else if (entry[0] === 'H' && entry[2] === 'COLUMNS') {
      cols = parseInt(entry[3], 10);
    } else if (entry[0] === 'H' && entry[2] === 'LINES') {
      rows = parseInt(entry[3], 10);
    }
  }

  cols = cols ?? 80;
  rows = rows ?? 24;

  return { cols, rows, output, input };
}

export default parse;
