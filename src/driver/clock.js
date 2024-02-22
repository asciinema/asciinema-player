function clock(
  { hourColor = 3, minuteColor = 4, separatorColor = 9 },
  { feed },
  { cols = 5, rows = 1 },
) {
  const middleRow = Math.floor(rows / 2);
  const leftPad = Math.floor(cols / 2) - 2;
  const setupCursor = `\x1b[?25l\x1b[1m\x1b[${middleRow}B`;
  let intervalId;

  const getCurrentTime = () => {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes();
    const seqs = [];

    seqs.push("\r");

    for (let i = 0; i < leftPad; i++) {
      seqs.push(" ");
    }

    seqs.push(`\x1b[3${hourColor}m`);

    if (h < 10) {
      seqs.push("0");
    }

    seqs.push(`${h}`);
    seqs.push(`\x1b[3${separatorColor};5m:\x1b[25m`);
    seqs.push(`\x1b[3${minuteColor}m`);

    if (m < 10) {
      seqs.push("0");
    }

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
    },
  };
}

export default clock;
