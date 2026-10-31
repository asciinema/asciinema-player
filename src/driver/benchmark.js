import parseAsciicast from "../parser/asciicast";
import { Clock } from "../clock";

function benchmark({ url, iterations = 10 }, { dispatch }) {
  const clock = new Clock((timing) => dispatch("timing", timing));
  let data;
  let byteCount = 0;
  let endTimeoutId;

  return {
    async init() {
      const recording = await parseAsciicast(await fetch(url));
      const { cols, rows, events } = recording;

      data = Array.from(events)
        .filter(([_time, type, _text]) => type === "o")
        .map(([time, _type, text]) => [time, text]);

      for (const [_, text] of data) {
        byteCount += new Blob([text]).size;
      }

      dispatch("reset", { size: { cols, rows } });
    },

    play() {
      clearTimeout(endTimeoutId);
      clock.setTime(0, 1);
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const [_, text] of data) {
          dispatch("output", text);
        }

        dispatch("output", "\x1bc"); // reset terminal
      }

      const endTime = performance.now();
      clock.stop();
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

      endTimeoutId = setTimeout(() => {
        dispatch("ended");
      }, 0);

      return true;
    },

    stop() {
      clearTimeout(endTimeoutId);
      clock.stop();
    },

    getTiming: () => clock.getTiming(),
  };
}

export default benchmark;
