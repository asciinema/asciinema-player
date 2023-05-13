import parseAsciicast from '../parser/asciicast';


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

export default benchmark;
