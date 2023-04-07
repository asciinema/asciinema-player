import { unparseAsciicastV2 } from '../parser/asciicast';
import Stream from '../stream';


function recording(src, { feed, onInput, now, setTimeout, setState, logger }, { idleTimeLimit, startAt, loop }) {
  let cols;
  let rows;
  let outputs;
  let inputs;
  let duration;
  let effectiveStartAt;
  let outputTimeoutId;
  let inputTimeoutId;
  let nextOutputIndex = 0;
  let nextInputIndex = 0;
  let lastOutputTime = 0;
  let startTime;
  let pauseElapsedTime;
  let playCount = 0;

  async function init() {
    const { parser, minFrameTime, inputOffset, dumpFilename } = src;

    const recording = prepare(
      parser(await doFetch(src)),
      logger,
      { idleTimeLimit, startAt, minFrameTime, inputOffset }
    );

    ({ output: outputs, input: inputs, cols, rows, duration, effectiveStartAt } = recording);

    if (outputs.length === 0) {
      throw 'recording is missing output events';
    }

    if (dumpFilename !== undefined) {
      const link = document.createElement('a');
      const asciicast = unparseAsciicastV2(recording);
      link.href = URL.createObjectURL(new Blob([asciicast], { type: 'text/plain' }));
      link.download = dumpFilename;
      link.click();
    }

    return { cols, rows, duration };
  }

  async function doFetch({ url, data, fetchOpts = {} }) {
    if (url !== undefined) {
      const response = await fetch(url, fetchOpts);

      if (!response.ok) {
        throw `failed fetching recording file: ${response.statusText} (${response.status})`;
      }

      return await response.text();
    } else if (data !== undefined) {
      if (typeof data === 'function') {
        data = data();
      }

      return await data;
    } else {
      throw 'failed fetching recording file: url/data missing in src';
    }
  }

  function delay(targetTime) {
    let delay = (targetTime * 1000) - (now() - startTime);

    if (delay < 0) {
      delay = 0;
    }

    return delay;
  }

  function scheduleNextOutput() {
    const nextOutput = outputs[nextOutputIndex];

    if (nextOutput) {
      outputTimeoutId = setTimeout(runNextOutput, delay(nextOutput[0]));
    } else {
      onEnd();
    }
  }

  function runNextOutput() {
    let output = outputs[nextOutputIndex];
    let elapsedWallTime;

    do {
      feed(output[1]);
      lastOutputTime = output[0];
      output = outputs[++nextOutputIndex];
      elapsedWallTime = now() - startTime;
    } while (output && (elapsedWallTime > output[0] * 1000));

    scheduleNextOutput();
  }

  function cancelNextOutput() {
    clearTimeout(outputTimeoutId);
    outputTimeoutId = null;
  }

  function scheduleNextInput() {
    const nextInput = inputs[nextInputIndex];

    if (nextInput) {
      inputTimeoutId = setTimeout(runNextInput, delay(nextInput[0]));
    }
  }

  function runNextInput() {
    onInput(inputs[nextInputIndex++][1]);
    scheduleNextInput();
  }

  function cancelNextInput() {
    clearTimeout(inputTimeoutId);
    inputTimeoutId = null;
  }

  function onEnd() {
    cancelNextOutput();
    cancelNextInput();
    playCount++;

    if (loop === true || (typeof loop === 'number' && playCount < loop)) {
      nextOutputIndex = 0;
      nextInputIndex = 0;
      startTime = now();
      feed('\x1bc'); // reset terminal
      scheduleNextOutput();
      scheduleNextInput();
    } else {
      pauseElapsedTime = duration * 1000;
      effectiveStartAt = null;
      setState('stopped', { reason: 'ended' });
    }
  }

  function play() {
    if (outputTimeoutId) return true;

    if (outputs[nextOutputIndex] === undefined) { // ended
      effectiveStartAt = 0;
    }

    if (effectiveStartAt !== null) {
      seek(effectiveStartAt);
    }

    resume();

    return true;
  }

  function pause() {
    if (!outputTimeoutId) return true;

    cancelNextOutput();
    cancelNextInput();
    pauseElapsedTime = now() - startTime;

    return true;
  }

  function resume() {
    startTime = now() - pauseElapsedTime;
    pauseElapsedTime = null;
    scheduleNextOutput();
    scheduleNextInput();
  }

  function seek(where) {
    const isPlaying = !!outputTimeoutId;
    pause();

    if (typeof where === 'string') {
      const currentTime = (pauseElapsedTime ?? 0) / 1000;

      if (where === '<<') {
        where = currentTime - 5;
      } else if (where === '>>') {
        where = currentTime + 5;
      } else if (where === '<<<') {
        where = currentTime - (0.1 * duration);
      } else if (where === '>>>') {
        where = currentTime + (0.1 * duration);
      } else if (where[where.length - 1] === '%') {
        where = (parseFloat(where.substring(0, where.length - 1)) / 100) * duration;
      }
    }

    const targetTime = Math.min(Math.max(where, 0), duration);

    if (targetTime < lastOutputTime) {
      feed('\x1bc'); // reset terminal
      nextOutputIndex = 0;
      nextInputIndex = 0;
      lastOutputTime = 0;
    }

    let output = outputs[nextOutputIndex];

    while (output && (output[0] < targetTime)) {
      feed(output[1]);
      lastOutputTime = output[0];
      output = outputs[++nextOutputIndex];
    }

    let input = inputs[nextInputIndex];

    while (input && (input[0] < targetTime)) {
      input = inputs[++nextInputIndex];
    }

    pauseElapsedTime = targetTime * 1000;
    effectiveStartAt = null;

    if (isPlaying) {
      resume();
    }

    return true;
  }

  function step() {
    let nextOutput = outputs[nextOutputIndex];

    if (nextOutput !== undefined) {
      feed(nextOutput[1]);
      const targetTime = nextOutput[0];
      lastOutputTime = targetTime;
      pauseElapsedTime = targetTime * 1000;
      nextOutputIndex++;
      let input = inputs[nextInputIndex];

      while (input && (input[0] < targetTime)) {
        input = inputs[++nextInputIndex];
      }
    }

    effectiveStartAt = null;
  }

  function getPoster(time) {
    const posterTime = time * 1000;
    const poster = [];
    let nextOutputIndex = 0;
    let output = outputs[0];

    while (output && (output[0] * 1000 < posterTime)) {
      poster.push(output[1]);
      output = outputs[++nextOutputIndex];
    }

    return poster;
  }

  function getCurrentTime() {
    if (outputTimeoutId) {
      return (now() - startTime) / 1000;
    } else {
      return (pauseElapsedTime ?? 0) / 1000;
    }
  }

  return {
    init,
    play,
    pause,
    seek,
    step,
    stop: pause,
    getPoster,
    getCurrentTime
  }
}

function batcher(logger, minFrameTime = 1.0 / 60) {
  let prevOutput;

  return emit => {
    let ic = 0;
    let oc = 0;

    return {
      step: output => {
        ic++;

        if (prevOutput === undefined) {
          prevOutput = output;
          return;
        }

        if (output[0] - prevOutput[0] < minFrameTime) {
          prevOutput[1] += output[1];
        } else {
          emit(prevOutput);
          prevOutput = output;
          oc++;
        }
      },

      flush: () => {
        if (prevOutput !== undefined) {
          emit(prevOutput);
          oc++;
        }

        logger.debug(`batched ${ic} frames to ${oc} frames`);
      }
    }
  };
}

function prepare(recording, logger, { startAt = 0, idleTimeLimit, minFrameTime, inputOffset }) {
  idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit ?? Infinity;
  let { output, input = [] } = recording;
  let prevT = 0;
  let shift = 0;
  let effectiveStartAt = startAt;

  if (!(output instanceof Stream)) {
    output = new Stream(output);
  }

  output = output
    .transform(batcher(logger, minFrameTime))
    .map(e => {
      const delay = e[0] - prevT;
      const delta = delay - idleTimeLimit;
      prevT = e[0];

      if (delta > 0) {
        shift += delta;

        if (e[0] < startAt) {
          effectiveStartAt -= delta;
        }
      }

      return [e[0] - shift, e[1]];
    })
    .toArray();

  const duration = output[output.length - 1][0];

  if (inputOffset !== undefined) {
    if (!(input instanceof Stream)) {
      input = new Stream(input);
    }

    input = input.map(i => [i[0] + inputOffset, i[1]]);
  }

  if (!Array.isArray(input)) {
    input = input.toArray();
  }

  return { ...recording, output, input, duration, effectiveStartAt };
}

export { recording };
