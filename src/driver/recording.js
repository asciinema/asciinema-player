import Stream from "../stream";
import { toErrorPayload } from "../error";

function recording(
  src,
  { dispatch, logger },
  {
    speed,
    idleTimeLimit,
    startAt,
    preload,
    loop,
    poster,
    markers: markers_,
    pauseOnMarkers,
    cols: initialCols,
    rows: initialRows,
    audioUrl,
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
  let waitingForAudio = false;
  let waitingTimeout;
  let loadingTimeout;
  let shouldResumeOnAudioPlaying = false;
  let now = () => performance.now() * speed;
  let audioCtx;
  let audioElement;
  let audioSeekable = false;
  let loaded;
  let posterVisible = false;
  let posterRenderableAfterLoad = poster !== undefined;

  function init() {
    if (preload) {
      return ensureLoaded();
    } else {
      if (poster !== undefined) {
        if (poster.type == "npt") {
          return ensureLoaded();
        } else if (poster.type == "text") {
          renderPoster();
          posterRenderableAfterLoad = false;
        }
      }
    }
  }

  function ensureLoaded() {
    if (loaded === undefined) {
      loaded = load();
      void loaded.catch(() => {});
    }

    return loaded;
  }

  function withLoaded(f) {
    return async function (...args) {
      await ensureLoaded();
      return await f.apply(this, args);
    };
  }

  async function load() {
    loadingTimeout = setTimeout(() => {
      dispatch("loading");
    }, 3000);

    try {
      const parsedRecording = loadRecording(src);
      const audioLoaded = loadAudio(audioUrl);
      void audioLoaded.catch(() => {});

      const recording = prepareRecording(await parsedRecording, logger, {
        idleTimeLimit,
        startAt,
        markers: markers_,
        minFrameTime: src.minFrameTime,
        inputOffset: src.inputOffset,
      });

      const hasAudio = await audioLoaded;

      ({ cols, rows, events, duration, effectiveStartAt } = recording);
      initialCols = initialCols ?? cols;
      initialRows = initialRows ?? rows;

      const theme = recording.theme ?? null;
      markers = events.filter((e) => e[1] === "m").map((e) => [e[0], e[2].label]);

      dispatch("metadata", { duration, markers, hasAudio });
      dispatch("reset", { size: { cols, rows }, theme });
      renderPoster();
    } catch (e) {
      dispatch("error", toErrorPayload(e));
      throw e;
    } finally {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }
  }

  async function loadAudio(audioUrl) {
    if (!audioUrl) return false;

    audioElement = await createAudioElement(audioUrl);

    audioSeekable =
      !Number.isNaN(audioElement.duration) &&
      audioElement.duration !== Infinity &&
      audioElement.seekable.length > 0 &&
      audioElement.seekable.end(audioElement.seekable.length - 1) === audioElement.duration;

    if (audioSeekable) {
      audioElement.addEventListener("playing", onAudioPlaying);
      audioElement.addEventListener("waiting", onAudioWaiting);
    } else {
      logger.warn(
        `audio is not seekable - you must enable range request support on the server providing ${audioElement.src} for audio seeking to work`,
      );
    }

    return true;
  }

  function renderPoster() {
    if (!posterRenderableAfterLoad) return;

    if (poster.type == "npt") {
      feed(getPoster(poster.value));
    } else if (poster.type == "text") {
      feed(poster.value);
    }

    posterVisible = true;
  }

  function getPoster(time) {
    return events.filter((e) => e[0] < time && e[1] === "o").map((e) => e[2]);
  }

  function clearPoster() {
    if (posterVisible) {
      feed("\x1bc");
    }

    posterVisible = false;
    posterRenderableAfterLoad = false;
  }

  function scheduleNextEvent() {
    const nextEvent = events[nextEventIndex];

    if (nextEvent) {
      eventTimeoutId = scheduleAt(runNextEvent, nextEvent[0]);
    } else {
      onEnd();
    }
  }

  function scheduleAt(f, targetTime) {
    let timeout = (targetTime * 1000 - (now() - startTime)) / speed;

    if (timeout < 0) {
      timeout = 0;
    }

    return setTimeout(f, timeout);
  }

  function runNextEvent() {
    let event = events[nextEventIndex];

    while (event !== undefined) {
      lastEventTime = event[0];
      nextEventIndex++;

      if (executeEvent(event)) {
        return;
      }

      const nextEvent = events[nextEventIndex];

      if (nextEvent === undefined) {
        break;
      }

      const elapsedWallTime = now() - startTime;

      if (elapsedWallTime <= nextEvent[0] * 1000) {
        break;
      }

      event = nextEvent;
    }

    scheduleNextEvent();
  }

  function cancelNextEvent() {
    clearTimeout(eventTimeoutId);
    eventTimeoutId = null;
  }

  async function teardownAudio() {
    clearTimeout(waitingTimeout);

    if (audioElement) {
      audioElement.removeEventListener("playing", onAudioPlaying);
      audioElement.removeEventListener("waiting", onAudioWaiting);
      audioElement.pause();
      audioElement.src = "";
      audioElement.load();
      audioElement = undefined;
    }

    if (audioCtx) {
      await audioCtx.close();
      audioCtx = undefined;
    }
  }

  function executeEvent(event) {
    const [time, type, data] = event;

    if (type === "o") {
      feed(data);
    } else if (type === "i") {
      dispatch("input", { data });
    } else if (type === "r") {
      const [cols, rows] = data.split("x").map((n) => Number.parseInt(n, 10));
      dispatch("resize", { cols, rows });
    } else if (type === "m") {
      dispatch("marker", data);

      if (pauseOnMarkers) {
        pause();
        pauseElapsedTime = time * 1000;

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

      if (audioElement) {
        audioElement.currentTime = 0;
      }
    } else {
      pauseElapsedTime = duration * 1000;
      dispatch("ended");

      if (audioElement) {
        audioElement.pause();
      }
    }
  }

  async function play() {
    clearPoster();
    dispatch("play");
    await ensureLoaded();

    if (eventTimeoutId) return true;

    if (events[nextEventIndex] === undefined) {
      await doSeek(0);
    } else if (effectiveStartAt !== null) {
      await doSeek(effectiveStartAt);
    }

    await resume();
    dispatch("playing");

    return true;
  }

  function pause() {
    shouldResumeOnAudioPlaying = false;

    if (audioElement) {
      audioElement.pause();
    }

    if (!eventTimeoutId) return true;

    doPause();
    dispatch("pause");

    return true;
  }

  function doPause() {
    cancelNextEvent();
    pauseElapsedTime = now() - startTime;
  }

  async function resume() {
    if (audioElement && !audioCtx) setupAudioCtx();

    startTime = now() - pauseElapsedTime;
    pauseElapsedTime = null;
    scheduleNextEvent();

    if (audioElement) {
      await audioElement.play();
    }
  }

  async function seek(where) {
    clearPoster();

    if (await doSeek(where)) {
      dispatch("seeked");
      return true;
    }

    return false;
  }

  const doSeek = withLoaded(async function (where) {
    if (waitingForAudio) {
      return false;
    }

    const isPlaying = !!eventTimeoutId;

    if (isPlaying) {
      doPause();
    }

    if (audioElement) {
      audioElement.pause();
    }

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
          throw new Error(`invalid marker index: ${where.marker}`);
        } else {
          where = marker[0];
        }
      }
    }

    const targetTime = Math.min(Math.max(where, 0), duration);

    if (targetTime * 1000 === pauseElapsedTime) return false;

    if (targetTime < lastEventTime) {
      feed("\x1bc"); // reset terminal
      resizeTerminalToInitialSize();
      nextEventIndex = 0;
      lastEventTime = 0;
    }

    let event = events[nextEventIndex];

    while (event && event[0] <= targetTime) {
      if (event[1] === "o" || event[1] === "r") {
        executeEvent(event);
      }

      lastEventTime = event[0];
      event = events[++nextEventIndex];
    }

    pauseElapsedTime = targetTime * 1000;
    effectiveStartAt = null;

    if (audioElement && audioSeekable) {
      audioElement.currentTime = targetTime / speed;
    }

    if (isPlaying) {
      await resume();
    } else if (events[nextEventIndex] === undefined) {
      onEnd();
    }

    return true;
  });

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

  const step = withLoaded(function (n) {
    if (eventTimeoutId) return;

    clearPoster();

    if (n === undefined) {
      n = 1;
    }

    let nextEvent;
    let targetIndex;

    if (n > 0) {
      let index = nextEventIndex;
      nextEvent = events[index];

      for (let i = 0; i < n; i++) {
        while (nextEvent !== undefined && nextEvent[1] !== "o") {
          nextEvent = events[++index];
        }

        if (nextEvent !== undefined && nextEvent[1] === "o") {
          targetIndex = index;
          nextEvent = events[++index];
        }
      }
    } else {
      let index = Math.max(nextEventIndex - 2, 0);
      nextEvent = events[index];

      for (let i = n; i < 0; i++) {
        while (nextEvent !== undefined && nextEvent[1] !== "o") {
          nextEvent = events[--index];
        }

        if (nextEvent !== undefined && nextEvent[1] === "o") {
          targetIndex = index;
        }
      }

      if (targetIndex !== undefined) {
        feed("\x1bc"); // reset terminal
        resizeTerminalToInitialSize();
        nextEventIndex = 0;
      }
    }

    if (targetIndex === undefined) return;

    while (nextEventIndex <= targetIndex) {
      nextEvent = events[nextEventIndex++];

      if (nextEvent[1] === "o" || nextEvent[1] === "r") {
        executeEvent(nextEvent);
      }
    }

    lastEventTime = nextEvent[0];
    pauseElapsedTime = lastEventTime * 1000;
    effectiveStartAt = null;

    if (audioElement && audioSeekable) {
      audioElement.currentTime = lastEventTime / speed;
    }

    if (events[targetIndex + 1] === undefined) {
      onEnd();
    }
  });

  function getDuration() {
    return duration;
  }

  function getCurrentTime() {
    if (eventTimeoutId) {
      return (now() - startTime) / 1000;
    } else {
      return (pauseElapsedTime ?? 0) / 1000;
    }
  }

  function resizeTerminalToInitialSize() {
    dispatch("resize", { cols: initialCols, rows: initialRows });
  }

  function setupAudioCtx() {
    audioCtx = new AudioContext({ latencyHint: "interactive" });
    const src = audioCtx.createMediaElementSource(audioElement);
    src.connect(audioCtx.destination);
    now = audioNow;
  }

  function audioNow() {
    if (!audioCtx) throw new Error("audio context not started - can't tell time!");

    const { contextTime, performanceTime } = audioCtx.getOutputTimestamp();

    // The check below is needed for Chrome,
    // which returns 0 for first several dozen millis,
    // completely ruining the timing (the clock jumps backwards once),
    // therefore we initially ignore performanceTime in our calculation.

    return performanceTime === 0
      ? contextTime * 1000
      : contextTime * 1000 + (performance.now() - performanceTime);
  }

  function onAudioWaiting() {
    logger.debug("audio buffering");
    waitingForAudio = true;
    shouldResumeOnAudioPlaying = !!eventTimeoutId;
    clearTimeout(waitingTimeout);
    waitingTimeout = setTimeout(() => {
      dispatch("loading");
    }, 1000);

    if (!eventTimeoutId) return true;

    logger.debug("pausing session playback");
    cancelNextEvent();
    pauseElapsedTime = now() - startTime;
  }

  function onAudioPlaying() {
    logger.debug("audio resumed");
    clearTimeout(waitingTimeout);
    waitingTimeout = null;

    if (!waitingForAudio) return;

    waitingForAudio = false;
    dispatch("playing");

    if (shouldResumeOnAudioPlaying) {
      logger.debug("resuming session playback");
      startTime = now() - pauseElapsedTime;
      pauseElapsedTime = null;
      scheduleNextEvent();
    }
  }

  function mute() {
    if (audioElement) {
      audioElement.muted = true;
      dispatch("muted", true);
      return true;
    }
  }

  function unmute() {
    if (audioElement) {
      audioElement.muted = false;
      dispatch("muted", false);
      return true;
    }
  }

  async function stop() {
    clearTimeout(loadingTimeout);
    cancelNextEvent();
    await teardownAudio();
  }

  function feed(data) {
    dispatch("output", data);
  }

  return {
    init,
    stop,
    getDuration,
    getCurrentTime,
    play,
    pause,
    seek,
    step,
    mute,
    unmute,
  };
}

async function loadRecording(src) {
  const { parser, encoding = "utf-8" } = src;
  const data = await doFetch(src);

  return await parser(data, { encoding });
}

async function doFetch({ url, data, fetchOpts = {} }) {
  if (typeof url === "string") {
    return await doFetchOne(url, fetchOpts);
  } else if (Array.isArray(url)) {
    return await Promise.all(url.map((url) => doFetchOne(url, fetchOpts)));
  } else if (data !== undefined) {
    if (typeof data === "function") {
      data = data();
    }

    if (!(data instanceof Promise)) {
      data = Promise.resolve(data);
    }

    const value = await data;

    if (typeof value === "string" || value instanceof ArrayBuffer) {
      return new Response(value);
    } else {
      return value;
    }
  } else {
    throw new Error("failed fetching recording file: url/data missing in src");
  }
}

async function doFetchOne(url, fetchOpts) {
  const response = await fetch(url, fetchOpts);

  if (!response.ok) {
    throw new Error(
      `failed fetching recording from ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response;
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

function prepareRecording(
  recording,
  logger,
  { startAt = 0, idleTimeLimit, minFrameTime, inputOffset, markers },
) {
  let { events } = recording;

  if (!(events instanceof Stream)) {
    events = new Stream(events);
  }

  idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit ?? Infinity;
  const limiterOutput = { offset: 0 };

  events = events.transform(batcher(logger, minFrameTime));

  if (markers !== undefined) {
    markers = new Stream(markers).map(normalizeMarker);
    events = events.filter((e) => e[1] !== "m").multiplex(markers, (a, b) => a[0] < b[0]);
  }

  events = events.map(timeLimiter(idleTimeLimit, startAt, limiterOutput)).map(markerWrapper());
  events = events.toArray();

  if (inputOffset !== undefined) {
    events = events.map((e) => (e[1] === "i" ? [e[0] + inputOffset, e[1], e[2]] : e));
    events.sort((a, b) => a[0] - b[0]);
  }

  if (events.length === 0) {
    throw new Error("recording is missing events");
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

async function createAudioElement(src) {
  const audio = new Audio();
  audio.preload = "metadata";
  audio.loop = false;
  audio.crossOrigin = "anonymous";

  let resolve;
  let reject;

  const canPlay = new Promise((resolve_, reject_) => {
    resolve = resolve_;
    reject = reject_;
  });

  function cleanup() {
    audio.removeEventListener("canplay", onCanPlay);
    audio.removeEventListener("error", onError);
    audio.removeEventListener("abort", onAbort);
  }

  function onCanPlay() {
    cleanup();
    resolve();
  }

  function onError() {
    cleanup();
    reject(new Error(`failed loading audio from ${src}`));
  }

  function onAbort() {
    cleanup();
    reject(new Error(`audio loading aborted for ${src}`));
  }

  audio.addEventListener("canplay", onCanPlay);
  audio.addEventListener("error", onError);
  audio.addEventListener("abort", onAbort);
  audio.src = src;
  audio.load();
  await canPlay;

  return audio;
}

export default recording;
export { loadRecording, prepareRecording };
