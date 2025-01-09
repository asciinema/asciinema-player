import { unparseAsciicastV2 } from "../parser/asciicast";
import Stream from "../stream";

function recording(
  src,
  { feed, resize, onInput, onMarker, now, setTimeout, setState, logger },
  {
    idleTimeLimit,
    startAt,
    loop,
    posterTime,
    markers: markers_,
    pauseOnMarkers,
    cols: initialCols,
    rows: initialRows,
  },
) {
  let cols;
  let rows;
  let events;
  let markers;
  let duration;
  let effectiveStartAt;
  let eventTimeoutId;
  let nextEventIndex = 0;
  let lastEventTime = 0;
  let startTime;
  let pauseElapsedTime;
  let playCount = 0;

  async function init() {
    const { parser, minFrameTime, inputOffset, dumpFilename, encoding = "utf-8" } = src;

    const recording = prepare(await parser(await doFetch(src), { encoding }), logger, {
      idleTimeLimit,
      startAt,
      minFrameTime,
      inputOffset,
      markers_,
    });

    ({ cols, rows, events, duration, effectiveStartAt } = recording);
    initialCols = initialCols ?? cols;
    initialRows = initialRows ?? rows;

    if (events.length === 0) {
      throw "recording is missing events";
    }

    if (dumpFilename !== undefined) {
      dump(recording, dumpFilename);
    }

    const poster = posterTime !== undefined ? getPoster(posterTime) : undefined;
    markers = events.filter((e) => e[1] === "m").map((e) => [e[0], e[2].label]);

    return { cols, rows, duration, theme: recording.theme, poster, markers };
  }

  function doFetch({ url, data, fetchOpts = {} }) {
    if (typeof url === "string") {
      return doFetchOne(url, fetchOpts);
    } else if (Array.isArray(url)) {
      return Promise.all(url.map((url) => doFetchOne(url, fetchOpts)));
    } else if (data !== undefined) {
      if (typeof data === "function") {
        data = data();
      }

      if (!(data instanceof Promise)) {
        data = Promise.resolve(data);
      }

      return data.then((value) => {
        if (typeof value === "string" || value instanceof ArrayBuffer) {
          return new Response(value);
        } else {
          return value;
        }
      });
    } else {
      throw "failed fetching recording file: url/data missing in src";
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
    let delay = targetTime * 1000 - (now() - startTime);

    if (delay < 0) {
      delay = 0;
    }

    return delay;
  }

  function scheduleNextEvent() {
    const nextEvent = events[nextEventIndex];

    if (nextEvent) {
      eventTimeoutId = setTimeout(runNextEvent, delay(nextEvent[0]));
    } else {
      onEnd();
    }
  }

  function runNextEvent() {
    let event = events[nextEventIndex];
    let elapsedWallTime;

    do {
      lastEventTime = event[0];
      nextEventIndex++;
      const stop = executeEvent(event);

      if (stop) {
        return;
      }

      event = events[nextEventIndex];
      elapsedWallTime = now() - startTime;
    } while (event && elapsedWallTime > event[0] * 1000);

    scheduleNextEvent();
  }

  function cancelNextEvent() {
    clearTimeout(eventTimeoutId);
    eventTimeoutId = null;
  }

  function executeEvent(event) {
    const [time, type, data] = event;

    if (type === "o") {
      feed(data);
    } else if (type === "i") {
      onInput(data);
    } else if (type === "r") {
      const [cols, rows] = data.split("x");
      resize(cols, rows);
    } else if (type === "m") {
      onMarker(data);

      if (pauseOnMarkers) {
        pause();
        pauseElapsedTime = time * 1000;
        setState("idle", { reason: "paused" });

        return true;
      }
    }

    return false;
  }

  function onEnd() {
    cancelNextEvent();
    playCount++;

    if (loop === true || (typeof loop === "number" && playCount < loop)) {
      nextEventIndex = 0;
      startTime = now();
      feed("\x1bc"); // reset terminal
      resizeTerminalToInitialSize();
      scheduleNextEvent();
    } else {
      pauseElapsedTime = duration * 1000;
      setState("ended");
    }
  }

  function play() {
    if (eventTimeoutId) throw "already playing";
    if (events[nextEventIndex] === undefined) throw "already ended";

    if (effectiveStartAt !== null) {
      seek(effectiveStartAt);
    }

    resume();

    return true;
  }

  function pause() {
    if (!eventTimeoutId) return true;

    cancelNextEvent();
    pauseElapsedTime = now() - startTime;

    return true;
  }

  function resume() {
    startTime = now() - pauseElapsedTime;
    pauseElapsedTime = null;
    scheduleNextEvent();
  }

  function seek(where) {
    const isPlaying = !!eventTimeoutId;
    pause();

    const currentTime = (pauseElapsedTime ?? 0) / 1000;

    if (typeof where === "string") {
      if (where === "<<") {
        where = currentTime - 5;
      } else if (where === ">>") {
        where = currentTime + 5;
      } else if (where === "<<<") {
        where = currentTime - 0.1 * duration;
      } else if (where === ">>>") {
        where = currentTime + 0.1 * duration;
      } else if (where[where.length - 1] === "%") {
        where = (parseFloat(where.substring(0, where.length - 1)) / 100) * duration;
      }
    } else if (typeof where === "object") {
      if (where.marker === "prev") {
        where = findMarkerTimeBefore(currentTime) ?? 0;

        if (isPlaying && currentTime - where < 1) {
          where = findMarkerTimeBefore(where) ?? 0;
        }
      } else if (where.marker === "next") {
        where = findMarkerTimeAfter(currentTime) ?? duration;
      } else if (typeof where.marker === "number") {
        const marker = markers[where.marker];

        if (marker === undefined) {
          throw `invalid marker index: ${where.marker}`;
        } else {
          where = marker[0];
        }
      }
    }

    const targetTime = Math.min(Math.max(where, 0), duration);

    if (targetTime < lastEventTime) {
      feed("\x1bc"); // reset terminal
      resizeTerminalToInitialSize();
      nextEventIndex = 0;
      lastEventTime = 0;
    }

    let event = events[nextEventIndex];

    while (event && event[0] <= targetTime) {
      if (event[1] === "o") {
        executeEvent(event);
      }

      lastEventTime = event[0];
      event = events[++nextEventIndex];
    }

    pauseElapsedTime = targetTime * 1000;
    effectiveStartAt = null;

    if (isPlaying) {
      resume();
    }

    return true;
  }

  function findMarkerTimeBefore(time) {
    if (markers.length == 0) return;

    let i = 0;
    let marker = markers[i];
    let lastMarkerTimeBefore;

    while (marker && marker[0] < time) {
      lastMarkerTimeBefore = marker[0];
      marker = markers[++i];
    }

    return lastMarkerTimeBefore;
  }

  function findMarkerTimeAfter(time) {
    if (markers.length == 0) return;

    let i = markers.length - 1;
    let marker = markers[i];
    let firstMarkerTimeAfter;

    while (marker && marker[0] > time) {
      firstMarkerTimeAfter = marker[0];
      marker = markers[--i];
    }

    return firstMarkerTimeAfter;
  }

  function step() {
    let nextEvent = events[nextEventIndex++];

    while (nextEvent !== undefined && nextEvent[1] !== "o") {
      nextEvent = events[nextEventIndex++];
    }

    if (nextEvent === undefined) return;

    feed(nextEvent[2]);

    const targetTime = nextEvent[0];
    lastEventTime = targetTime;
    pauseElapsedTime = targetTime * 1000;
    effectiveStartAt = null;
  }

  function restart() {
    if (eventTimeoutId) throw "still playing";
    if (events[nextEventIndex] !== undefined) throw "not ended";

    seek(0);
    resume();

    return true;
  }

  function getPoster(time) {
    return events.filter((e) => e[0] < time && e[1] === "o").map((e) => e[2]);
  }

  function getCurrentTime() {
    if (eventTimeoutId) {
      return (now() - startTime) / 1000;
    } else {
      return (pauseElapsedTime ?? 0) / 1000;
    }
  }

  function resizeTerminalToInitialSize() {
    resize(initialCols, initialRows);
  }

  return {
    init,
    play,
    pause,
    seek,
    step,
    restart,
    stop: pause,
    getCurrentTime,
  };
}

function batcher(logger, minFrameTime = 1.0 / 60) {
  let prevEvent;

  return (emit) => {
    let ic = 0;
    let oc = 0;

    return {
      step: (event) => {
        ic++;

        if (prevEvent === undefined) {
          prevEvent = event;
          return;
        }

        if (event[1] === "o" && prevEvent[1] === "o" && event[0] - prevEvent[0] < minFrameTime) {
          prevEvent[2] += event[2];
        } else {
          emit(prevEvent);
          prevEvent = event;
          oc++;
        }
      },

      flush: () => {
        if (prevEvent !== undefined) {
          emit(prevEvent);
          oc++;
        }

        logger.debug(`batched ${ic} frames to ${oc} frames`);
      },
    };
  };
}

function prepare(
  recording,
  logger,
  { startAt = 0, idleTimeLimit, minFrameTime, inputOffset, markers_ },
) {
  let { events } = recording;

  if (!(events instanceof Stream)) {
    events = new Stream(events);
  }

  idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit ?? Infinity;
  const limiterOutput = { offset: 0 };

  events = events
    .transform(batcher(logger, minFrameTime))
    .map(timeLimiter(idleTimeLimit, startAt, limiterOutput))
    .map(markerWrapper());

  if (markers_ !== undefined) {
    markers_ = new Stream(markers_).map(normalizeMarker);

    events = events
      .filter((e) => e[1] !== "m")
      .multiplex(markers_, (a, b) => a[0] < b[0])
      .map(markerWrapper());
  }

  events = events.toArray();

  if (inputOffset !== undefined) {
    events = events.map((e) => (e[1] === "i" ? [e[0] + inputOffset, e[1], e[2]] : e));
    events.sort((a, b) => a[0] - b[0]);
  }

  const duration = events[events.length - 1][0];
  const effectiveStartAt = startAt - limiterOutput.offset;

  return { ...recording, events, duration, effectiveStartAt };
}

function normalizeMarker(m) {
  return typeof m === "number" ? [m, "m", ""] : [m[0], "m", m[1]];
}

function timeLimiter(idleTimeLimit, startAt, output) {
  let prevT = 0;
  let shift = 0;

  return function (e) {
    const delay = e[0] - prevT;
    const delta = delay - idleTimeLimit;
    prevT = e[0];

    if (delta > 0) {
      shift += delta;

      if (e[0] < startAt) {
        output.offset += delta;
      }
    }

    return [e[0] - shift, e[1], e[2]];
  };
}

function markerWrapper() {
  let i = 0;

  return function (e) {
    if (e[1] === "m") {
      return [e[0], e[1], { index: i++, time: e[0], label: e[2] }];
    } else {
      return e;
    }
  };
}

function dump(recording, filename) {
  const link = document.createElement("a");
  const events = recording.events.map((e) => (e[1] === "m" ? [e[0], e[1], e[2].label] : e));
  const asciicast = unparseAsciicastV2({ ...recording, events });
  link.href = URL.createObjectURL(new Blob([asciicast], { type: "text/plain" }));
  link.download = filename;
  link.click();
}

export default recording;
