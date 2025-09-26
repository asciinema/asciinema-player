import parseAsciicast from "../parser/asciicast";

function benchmark({ url, iterations = 10 }, { feed, setState }) {
  let data;
  let byteCount = 0;

  return {
    async init() {
      const recording = await parseAsciicast(await fetch(url));
      const { cols, rows, events } = recording;

      data = Array.from(events)
        .filter(([_time, type, _text]) => type === "o")
        .map(([time, _type, text]) => [time, text]);

      const duration = data[data.length - 1][0];

      for (const [_, text] of data) {
        byteCount += new Blob([text]).size;
      }

      return { cols, rows, duration };
    },

    play() {
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const [_, text] of data) {
          feed(text);
        }

        feed("\x1bc"); // reset terminal
      }

      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      const throughput = (byteCount * iterations) / duration;
      const throughputMbs = ((byteCount / (1024 * 1024)) * iterations) / duration;

      console.info("benchmark: result", {
        byteCount,
        iterations,
        duration,
        throughput,
        throughputMbs,
      });

      setTimeout(() => {
        setState("stopped", { reason: "ended" });
      }, 0);

      return true;
    },
  };
}

export default benchmark;
