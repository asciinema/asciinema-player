import Stream from "../stream";

async function parse(data) {
  if (data instanceof Response) {
    const text = await data.text();
    const result = parseJsonl(text);

    if (result !== undefined) {
      const { header, events } = result;

      if (header.version === 2) {
        return parseAsciicastV2(header, events);
      } else if (header.version === 3) {
        return parseAsciicastV3(header, events);
      } else {
        throw new Error(`asciicast v${header.version} format not supported`);
      }
    } else {
      const header = JSON.parse(text);

      if (header.version === 1) {
        return parseAsciicastV1(header);
      }
    }
  } else if (typeof data === "object" && data.version === 1) {
    return parseAsciicastV1(data);
  } else if (Array.isArray(data)) {
    const header = data[0];

    if (header.version === 2) {
      const events = data.slice(1, data.length);
      return parseAsciicastV2(header, events);
    } else if (header.version === 3) {
      const events = data.slice(1, data.length);
      return parseAsciicastV3(header, events);
    } else {
      throw new Error(`asciicast v${header.version} format not supported`);
    }
  }

  throw new Error("invalid data");
}

function parseJsonl(jsonl) {
  const lines = jsonl.split("\n");
  let header;

  try {
    header = JSON.parse(lines[0]);
  } catch (_error) {
    return;
  }

  const events = new Stream(lines)
    .drop(1)
    .filter((l) => l[0] === "[")
    .map(JSON.parse);

  return { header, events };
}

function parseAsciicastV1(data) {
  let time = 0;

  const events = new Stream(data.stdout).map((e) => {
    time += e[0];
    return [time, "o", e[1]];
  });

  return {
    cols: data.width,
    rows: data.height,
    events,
  };
}

function parseAsciicastV2(header, events) {
  return {
    cols: header.width,
    rows: header.height,
    theme: parseTheme(header.theme),
    events,
    idleTimeLimit: header.idle_time_limit,
  };
}

function parseAsciicastV3(header, events) {
  if (!(events instanceof Stream)) {
    events = new Stream(events);
  }

  let time = 0;

  events = events.map((e) => {
    time += e[0];
    return [time, e[1], e[2]];
  });

  return {
    cols: header.term.cols,
    rows: header.term.rows,
    theme: parseTheme(header.term?.theme),
    events,
    idleTimeLimit: header.idle_time_limit,
  };
}

function parseTheme(theme) {
  if (theme === undefined) return;

  const colorRegex = /^#[0-9A-Fa-f]{6}$/;
  const paletteRegex = /^(#[0-9A-Fa-f]{6}:){7,}#[0-9A-Fa-f]{6}$/;
  const fg = theme?.fg;
  const bg = theme?.bg;
  const palette = theme?.palette;

  if (colorRegex.test(fg) && colorRegex.test(bg) && paletteRegex.test(palette)) {
    return {
      foreground: fg,
      background: bg,
      palette: palette.split(":"),
    };
  }
}

function unparseAsciicastV2(recording) {
  const header = JSON.stringify({
    version: 2,
    width: recording.cols,
    height: recording.rows,
  });

  const events = recording.events.map(JSON.stringify).join("\n");

  return `${header}\n${events}\n`;
}

export default parse;
export { parse, unparseAsciicastV2 };
