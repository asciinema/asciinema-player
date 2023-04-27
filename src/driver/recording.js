import { unparseAsciicastV2 } from '../parser/asciicast';
import Stream from '../stream';


function recording(src, { feed, onInput, now, setTimeout, setState, logger }, { idleTimeLimit, startAt, loop, breakpoints: bps, pauseOnBreakpoints }) {
  let cols;
  let rows;
  let outputs;
  let inputs;
  let breakpoints;
  let duration;
  let effectiveStartAt;
  let outputTimeoutId;
  let inputTimeoutId;
  let breakpointTimeoutId;
  let nextOutputIndex = 0;
  let nextInputIndex = 0;
  let nextBreakpointIndex = 0;
  let lastOutputTime = 0;
  let lastInputTime = 0;
  let lastBreakpointTime = 0;
  let startTime;
  let pauseElapsedTime;
  let playCount = 0;

  async function init() {
    const { parser, minFrameTime, inputOffset, dumpFilename, encoding = 'utf-8' } = src;

    const recording = prepare(
      await parser(await doFetch(src), { encoding }),
      logger,
      { idleTimeLimit, startAt, minFrameTime, inputOffset, bps }
    );

    ({ cols, rows, output: outputs, input: inputs, breakpoints, duration, effectiveStartAt } = recording);

    if (outputs.length === 0) {
      throw 'recording is missing output events';
    }

    if (dumpFilename !== undefined) {
      dump(recording, dumpFilename);
    }

    return { cols, rows, duration };
  }

  function doFetch({ url, data, fetchOpts = {} }) {
    if (typeof url === 'string') {
      return doFetchOne(url, fetchOpts);
    } else if (Array.isArray(url)) {
      return Promise.all(url.map(url => doFetchOne(url, fetchOpts)));
    } else if (data !== undefined) {
      if (typeof data === 'function') {
        data = data();
      }

      if (!(data instanceof Promise)) {
        data = Promise.resolve(data);
      }

      return data.then(value => {
        if (typeof value === 'string' || value instanceof ArrayBuffer) {
          return new Response(value);
        } else {
          return value;
        }
      });
    } else {
      throw 'failed fetching recording file: url/data missing in src';
    }
  }

  async function doFetchOne(url, fetchOpts) {
    const response = await fetch(url, fetchOpts);

    if (!response.ok) {
      throw `failed fetching recording from ${url}: ${response.status} ${response.statusText}`;
    }

    return response;
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
    let input = inputs[nextInputIndex++];
    lastInputTime = input[0];
    onInput(input[1]);
    scheduleNextInput();
  }

  function cancelNextInput() {
    clearTimeout(inputTimeoutId);
    inputTimeoutId = null;
  }

  function scheduleNextBreakpoint() {
    if (!pauseOnBreakpoints) return;

    const nextBreakpoint = breakpoints[nextBreakpointIndex];

    if (nextBreakpoint) {
      breakpointTimeoutId = setTimeout(runNextBreakpoint, delay(nextBreakpoint[0]));
    }
  }

  function runNextBreakpoint() {
    let breakpoint = breakpoints[nextBreakpointIndex++];
    lastBreakpointTime = breakpoint[0];
    pause();
    setState('stopped', { reason: 'paused' });
  }

  function cancelNextBreakpoint() {
    clearTimeout(breakpointTimeoutId);
    breakpointTimeoutId = null;
  }

  function onEnd() {
    cancelNextOutput();
    cancelNextInput();
    cancelNextBreakpoint();
    playCount++;

    if (loop === true || (typeof loop === 'number' && playCount < loop)) {
      nextOutputIndex = 0;
      nextInputIndex = 0;
      nextBreakpointIndex = 0;
      startTime = now();
      feed('\x1bc'); // reset terminal
      scheduleNextOutput();
      scheduleNextInput();
      scheduleNextBreakpoint();
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
    cancelNextBreakpoint();
    pauseElapsedTime = now() - startTime;

    return true;
  }

  function resume() {
    startTime = now() - pauseElapsedTime;
    pauseElapsedTime = null;
    scheduleNextOutput();
    scheduleNextInput();
    scheduleNextBreakpoint();
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
      lastOutputTime = 0;
    }

    let output = outputs[nextOutputIndex];

    while (output && (output[0] < targetTime)) {
      feed(output[1]);
      lastOutputTime = output[0];
      output = outputs[++nextOutputIndex];
    }

    if (targetTime < lastInputTime) {
      nextInputIndex = 0;
      lastInputTime = 0;
    }

    let input = inputs[nextInputIndex];

    while (input && (input[0] < targetTime)) {
      lastInputTime = input[0];
      input = inputs[++nextInputIndex];
    }

    if (targetTime < lastBreakpointTime) {
      nextBreakpointIndex = 0;
      lastBreakpointTime = 0;
    }

    let breakpoint = breakpoints[nextBreakpointIndex];

    while (breakpoint && (breakpoint[0] < targetTime)) {
      lastBreakpointTime = breakpoint[0];
      breakpoint = breakpoints[++nextBreakpointIndex];
    }

    pauseElapsedTime = targetTime * 1000;
    effectiveStartAt = null;

    if (isPlaying) {
      resume();
    }

    return true;
  }

  function step() {
    let nextOutput = outputs[nextOutputIndex++];
    if (nextOutput === undefined) return;
    feed(nextOutput[1]);
    const targetTime = nextOutput[0];
    lastOutputTime = targetTime;
    pauseElapsedTime = targetTime * 1000;

    let input = inputs[nextInputIndex];

    while (input && (input[0] < targetTime)) {
      lastInputTime = input[0];
      input = inputs[++nextInputIndex];
    }

    let breakpoint = breakpoints[nextBreakpointIndex];

    while (breakpoint && (breakpoint[0] < targetTime)) {
      lastBreakpointTime = breakpoint[0];
      breakpoint = breakpoints[++nextBreakpointIndex];
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

function prepare(recording, logger, { startAt = 0, idleTimeLimit, minFrameTime, inputOffset, bps }) {
  idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit ?? Infinity;
  let { output, input = [], breakpoints = [] } = recording;

  if (bps !== undefined) {
    breakpoints = bps;
  }

  if (!(output instanceof Stream)) {
    output = new Stream(output);
  }

  if (!(input instanceof Stream)) {
    input = new Stream(input);
  }

  if (!(breakpoints instanceof Stream)) {
    breakpoints = new Stream(breakpoints);
  }

  output = output
    .transform(batcher(logger, minFrameTime))
    .map(o => ['o', o]);

  input = input.map(i => ['i', i]);

  breakpoints = breakpoints.map(b =>
    typeof b === 'number'
    ? ['b', [b, '']]
    : ['b', b]
  );

  let prevT = 0;
  let shift = 0;
  let effectiveStartAt = startAt;

  const compressed = output
    .multiplex(input, (a, b) => a[1][0] < b[1][0])
    .multiplex(breakpoints, (a, b) => a[1][0] < b[1][0])
    .map(e => {
      const delay = e[1][0] - prevT;
      const delta = delay - idleTimeLimit;
      prevT = e[1][0];

      if (delta > 0) {
        shift += delta;

        if (e[1][0] < startAt) {
          effectiveStartAt -= delta;
        }
      }

      return [e[0], [e[1][0] - shift, e[1][1]]];
    });

  const streams = new Map([
    ['o', []],
    ['i', []],
    ['b', []]
  ]);

  for (const e of compressed) {
    streams.get(e[0]).push(e[1]);
  }

  output = streams.get('o');
  input = streams.get('i');
  breakpoints = streams.get('b');

  if (inputOffset !== undefined) {
    input = input.map(i => [i[0] + inputOffset, i[1]]);
  }

  const duration = output[output.length - 1][0];

  return { ...recording, output, input, duration, breakpoints, effectiveStartAt };
}

function dump(recording, filename) {
  const link = document.createElement('a');
  const asciicast = unparseAsciicastV2(recording);
  link.href = URL.createObjectURL(new Blob([asciicast], { type: 'text/plain' }));
  link.download = filename;
  link.click();
}

export { recording };
