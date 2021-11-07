function test(kind, callbacks, opts) {
  if (kind == 'random') {
    return random(callbacks);
  } else if (kind == 'clock') {
    return clock(callbacks, opts);
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

function clock({ feed }, { cols = 5, rows = 1 }) {
  const middleRow = Math.floor(rows / 2);
  const leftPad = Math.floor(cols / 2) - 2;
  let intervalId;

  return {
    cols: cols,
    rows: rows,
    duration: 24 * 60,

    start: () => {
      setTimeout(() => {
        feed(`\x1b[?25l\x1b[1m\x1b[${middleRow}B`);
      }, 0);

      intervalId = setInterval(() => {
        const d = new Date();
        const h = d.getHours();
        const m = d.getMinutes();

        feed('\r');
        for (let i = 0; i < leftPad; i++) { feed(' ') }
        feed('\x1b[32m');
        if (h < 10) { feed('0') }
        feed(`${h}`);
        feed('\x1b[39;5m:\x1b[25;35m')
        if (m < 10) { feed('0') }
        feed(`${m}`);
      }, 1000);
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

export { test };
