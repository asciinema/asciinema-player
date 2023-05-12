import parseAsciicast from '../parser/asciicast';


function test(src, callbacks, opts) {
  if (src.kind == 'random') {
    return random(callbacks);
  } else if (src.kind == 'clock') {
    return clock(src, callbacks, opts);
  } else if (src.kind == 'benchmark') {
    return benchmark(src, callbacks, opts);
  }
}

function random({ feed, setTimeout }) {
  const base = ' '.charCodeAt(0);
  const range = '~'.charCodeAt(0) - base;
  let timeoutId;

  const schedule = () => {
    const t = Math.pow(5, Math.random() * 4);
    timeoutId = setTimeout(print, t);
  }

  const print = () => {
    schedule();
    const char = String.fromCharCode(base + Math.floor(Math.random() * range));
    feed(char);
  };

  return () => {
    schedule();

    return () => clearInterval(timeoutId);
  }
}

function clock({ hourColor = 3, minuteColor = 4, separatorColor = 9 }, { feed }, { cols = 5, rows = 1 }) {
  const middleRow = Math.floor(rows / 2);
  const leftPad = Math.floor(cols / 2) - 2;
  const setupCursor = `\x1b[?25l\x1b[1m\x1b[${middleRow}B`;
  let intervalId;

  const getCurrentTime = () => {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes();
    const seqs = [];

    seqs.push('\r');
    for (let i = 0; i < leftPad; i++) { seqs.push(' ') }
    seqs.push(`\x1b[3${hourColor}m`);
    if (h < 10) { seqs.push('0') }
    seqs.push(`${h}`);
    seqs.push(`\x1b[3${separatorColor};5m:\x1b[25m`);
    seqs.push(`\x1b[3${minuteColor}m`);
    if (m < 10) { seqs.push('0') }
    seqs.push(`${m}`);

    return seqs;
  };

  const updateTime = () => {
    getCurrentTime().forEach(feed);
  };

  return {
    init: () => {
      const duration = 24 * 60;
      const poster = [setupCursor].concat(getCurrentTime());

      return { cols, rows, duration, poster };
    },

    play: () => {
      feed(setupCursor);
      updateTime();
      intervalId = setInterval(updateTime, 1000);

      return true;
    },

    stop: () => {
      clearInterval(intervalId);
    },

    getCurrentTime: () => {
      const d = new Date();

      return d.getHours() * 60 + d.getMinutes();
    }
  };
}

function benchmark({ url, iterations = 10 }, { feed, now }) {
  let frames;
  let byteCount = 0;

  return {
    async init() {
      const recording = await parseAsciicast(await fetch(url));
      const { cols, rows } = recording;
      frames = Array.from(recording.output);
      const duration = frames[frames.length - 1][0];

      for (const [_, text] of frames) {
        byteCount += new Blob([text]).size;
      }

      return { cols, rows, duration };
    },

    play() {
      const startTime = now();

      for (let i = 0; i < iterations; i++) {
        for (const [_, text] of frames) {
          feed(text);
        }

        feed('\x1bc'); // reset terminal
      }

      const endTime = now();
      const duration = (endTime - startTime) / 1000;
      const throughput = (byteCount * iterations) / duration;
      const throughputMbs = (byteCount / (1024 * 1024) * iterations) / duration;

      console.info('benchmark: result', { byteCount, iterations, duration, throughput, throughputMbs });
    }
  }
}

export { test };
