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
  const STATE = {
    COLD: "cold",
    LOADING: "loading",
    READY_PRISTINE: "ready.pristine",
    READY_PAUSED: "ready.paused",
    READY_STARTING: "ready.starting",
    READY_PLAYING: "ready.playing",
    READY_BUFFERING_PAUSED: "ready.buffering.paused",
    READY_BUFFERING_PLAYING: "ready.buffering.playing",
    READY_ENDED: "ready.ended",
    FAILED: "failed",
    STOPPED: "stopped",
  };

  const EVENT = {
    INIT_REQUESTED: "initRequested",
    PLAY_REQUESTED: "playRequested",
    PLAY_AFTER_LOAD: "playAfterLoad",
    PAUSE_REQUESTED: "pauseRequested",
    SEEK_REQUESTED: "seekRequested",
    STEP_REQUESTED: "stepRequested",
    STOP_REQUESTED: "stopRequested",
    LOAD_SUCCEEDED: "loadSucceeded",
    LOAD_FAILED: "loadFailed",
    PLAYBACK_START_CONFIRMED: "playbackStartConfirmed",
    SEEK_PLAYBACK_START_CONFIRMED: "seekPlaybackStartConfirmed",
    PLAYBACK_START_FAILED: "playbackStartFailed",
    PLAYBACK_ENDED: "playbackEnded",
    AUDIO_WAITING: "audioWaiting",
    AUDIO_PLAYING: "audioPlaying",
    MARKER_REACHED: "markerReached",
  };

  const outputBatchWindow = src.minFrameTime ?? 1 / 60;
  let now = () => performance.now() * speed;
  let state = STATE.COLD;
  let queuedEvents = [];
  let processingEvents = false;

  const ctx = {
    cols: undefined,
    rows: undefined,
    events: undefined,
    markers: undefined,
    duration: undefined,
    effectiveStartAt: undefined,
    eventTimeoutId: undefined,
    nextEventIndex: 0,
    lastEventTime: 0,
    startTime: undefined,
    pauseElapsedTime: undefined,
    playCount: 0,
    waitingTimeout: undefined,
    loadingTimeout: undefined,
    audioCtx: undefined,
    audioElement: undefined,
    audioSeekable: false,
    loaded: undefined,
    posterVisible: false,
    posterRenderableAfterLoad: poster !== undefined,
    failureError: null,
  };

  function isPlayingState(value = state) {
    return value === STATE.READY_PLAYING;
  }

  function isBufferingState(value = state) {
    return value === STATE.READY_BUFFERING_PAUSED || value === STATE.READY_BUFFERING_PLAYING;
  }

  function canLoopPlayback() {
    return loop === true || (typeof loop === "number" && ctx.playCount < loop);
  }

  function loadPromise() {
    if (ctx.loaded === undefined) {
      ctx.loaded = load();
      void ctx.loaded.catch(() => {});
    }

    return ctx.loaded;
  }

  // Public command events (INIT_REQUESTED, PLAY_REQUESTED, PAUSE_REQUESTED,
  // SEEK_REQUESTED, STEP_REQUESTED, STOP_REQUESTED) are serialized by Core.
  //
  // Primary non-stale state transitions:
  // COLD -> [INIT_REQUESTED] -> LOADING
  // COLD -> [PLAY_REQUESTED | SEEK_REQUESTED | STEP_REQUESTED] -> LOADING
  // LOADING -> [LOAD_SUCCEEDED] -> READY_PRISTINE
  // LOADING -> [LOAD_FAILED] -> FAILED
  // READY_PRISTINE -> [PLAY_REQUESTED | PLAY_AFTER_LOAD] -> READY_STARTING
  // READY_PRISTINE -> [SEEK_REQUESTED | STEP_REQUESTED] -> READY_PAUSED
  // READY_PAUSED -> [PLAY_REQUESTED] -> READY_STARTING
  // READY_PAUSED -> [SEEK_REQUESTED | STEP_REQUESTED] -> READY_PAUSED
  // READY_ENDED -> [PLAY_REQUESTED] -> READY_STARTING
  // READY_ENDED -> [SEEK_REQUESTED | STEP_REQUESTED] -> READY_PAUSED
  // READY_STARTING -> [PLAYBACK_START_CONFIRMED | SEEK_PLAYBACK_START_CONFIRMED]
  //   -> READY_PLAYING
  // READY_STARTING -> [PLAYBACK_START_FAILED] -> READY_PAUSED
  // READY_PLAYING -> [PAUSE_REQUESTED] -> READY_PAUSED
  // READY_PLAYING -> [SEEK_REQUESTED] -> READY_STARTING
  // READY_PLAYING -> [AUDIO_WAITING] -> READY_BUFFERING_PLAYING
  // READY_PLAYING -> [MARKER_REACHED] -> READY_PAUSED (pauseOnMarkers)
  // READY_BUFFERING_PLAYING -> [PAUSE_REQUESTED] -> READY_BUFFERING_PAUSED
  // READY_BUFFERING_PLAYING -> [AUDIO_PLAYING] -> READY_PLAYING
  // READY_BUFFERING_PAUSED -> [PLAY_REQUESTED] -> READY_BUFFERING_PLAYING
  // READY_BUFFERING_PAUSED -> [AUDIO_PLAYING] -> READY_PAUSED
  // READY_BUFFERING_PLAYING -> [PLAYBACK_START_FAILED] -> READY_BUFFERING_PAUSED
  // READY_PLAYING -> [PLAYBACK_ENDED] -> READY_ENDED | READY_PLAYING (loop)
  // COLD | READY_PRISTINE | READY_PAUSED | READY_PLAYING
  //   | READY_BUFFERING_PAUSED | READY_BUFFERING_PLAYING | READY_ENDED
  //   -> [STOP_REQUESTED] -> STOPPED
  function transition(currentState, event, payload = {}) {
    switch (event) {
      case EVENT.INIT_REQUESTED:
        if (currentState === STATE.COLD) {
          if (preload || poster?.type == "npt") {
            return { nextState: STATE.LOADING, action: () => loadPromise() };
          }

          if (poster?.type == "text") {
            return { nextState: currentState, action: () => renderTextPoster() };
          }
        }

        return { nextState: currentState };

      case EVENT.LOAD_SUCCEEDED:
        if (currentState !== STATE.LOADING) {
          return { nextState: currentState };
        }

        return {
          nextState: STATE.READY_PRISTINE,
          action: () => {
            dispatch("metadata", {
              duration: ctx.duration,
              markers: ctx.markers,
              hasAudio: payload.hasAudio,
            });
            dispatch("reset", {
              size: { cols: ctx.cols, rows: ctx.rows },
              theme: payload.theme,
            });
            renderPoster();
          },
        };

      case EVENT.LOAD_FAILED:
        if (currentState !== STATE.LOADING) {
          return { nextState: currentState };
        }

        return {
          nextState: STATE.FAILED,
          action: () => {
            ctx.failureError = payload.error;
            dispatch("error", toErrorPayload(payload.error));
          },
        };

      case EVENT.PLAY_REQUESTED:
        if (currentState === STATE.COLD) {
          return {
            nextState: STATE.LOADING,
            action: () => {
              clearPoster();
              dispatch("play");
              return loadPromise().then(() => sendEvent(EVENT.PLAY_AFTER_LOAD));
            },
          };
        }

        if (
          currentState === STATE.READY_PRISTINE ||
          currentState === STATE.READY_PAUSED ||
          currentState === STATE.READY_ENDED
        ) {
          return {
            nextState: STATE.READY_STARTING,
            action: () => {
              dispatch("play");
              clearPoster();
              return startPlayback(EVENT.PLAYBACK_START_CONFIRMED);
            },
          };
        }

        if (currentState === STATE.READY_BUFFERING_PAUSED) {
          return {
            nextState: STATE.READY_BUFFERING_PLAYING,
            action: () => {
              dispatch("play");
              if (ctx.audioElement) {
                return ctx.audioElement.play().catch((error) => {
                  sendEvent(EVENT.PLAYBACK_START_FAILED);
                  throw error;
                });
              }

              return true;
            },
          };
        }

        if (
          currentState === STATE.READY_BUFFERING_PLAYING ||
          currentState === STATE.READY_PLAYING
        ) {
          return {
            nextState: currentState,
            action: () => {
              dispatch("play");
              return true;
            },
          };
        }

        return { nextState: currentState };

      case EVENT.PLAY_AFTER_LOAD:
        if (currentState === STATE.READY_PRISTINE) {
          return {
            nextState: STATE.READY_STARTING,
            action: () => {
              clearPoster();
              return startPlayback(EVENT.PLAYBACK_START_CONFIRMED);
            },
          };
        }

        return { nextState: currentState };

      case EVENT.PLAYBACK_START_CONFIRMED:
        if (currentState !== STATE.READY_STARTING) {
          return { nextState: currentState };
        }

        return {
          nextState: STATE.READY_PLAYING,
          action: () => {
            confirmPlaybackClockStart();
            dispatch("playing");
            return true;
          },
        };

      case EVENT.SEEK_PLAYBACK_START_CONFIRMED:
        if (currentState !== STATE.READY_STARTING) {
          return { nextState: currentState };
        }

        return {
          nextState: STATE.READY_PLAYING,
          action: () => {
            confirmPlaybackClockStart();
            dispatch("seeked");
            return true;
          },
        };

      case EVENT.PLAYBACK_START_FAILED:
        if (currentState === STATE.READY_STARTING) {
          return {
            nextState: STATE.READY_PAUSED,
          };
        }

        if (currentState === STATE.READY_BUFFERING_PLAYING) {
          return {
            nextState: STATE.READY_BUFFERING_PAUSED,
          };
        }

        return { nextState: currentState };

      case EVENT.PLAYBACK_ENDED:
        if (currentState !== STATE.READY_PLAYING) {
          return { nextState: currentState };
        }

        if (canLoopPlayback()) {
          return {
            nextState: STATE.READY_PLAYING,
            action: restartLoop,
          };
        }

        return {
          nextState: STATE.READY_ENDED,
          action: finishPlayback,
        };

      case EVENT.AUDIO_WAITING:
        if (currentState === STATE.READY_PLAYING) {
          return {
            nextState: STATE.READY_BUFFERING_PLAYING,
            action: () => {
              logger.debug("pausing session playback");
              pausePlaybackClock();
              restartWaitingTimeout();
            },
          };
        }

        if (
          currentState === STATE.READY_BUFFERING_PAUSED ||
          currentState === STATE.READY_BUFFERING_PLAYING
        ) {
          return {
            nextState: currentState,
            action: restartWaitingTimeout,
          };
        }

        return { nextState: currentState };

      case EVENT.AUDIO_PLAYING:
        if (currentState === STATE.READY_BUFFERING_PLAYING) {
          return {
            nextState: STATE.READY_PLAYING,
            action: () => {
              logger.debug("resuming session playback");
              clearWaitingTimeout();
              confirmPlaybackClockStart();
              dispatch("playing");
            },
          };
        }

        if (currentState === STATE.READY_BUFFERING_PAUSED) {
          return {
            nextState: STATE.READY_PAUSED,
            action: () => {
              clearWaitingTimeout();
              // The media element may report recovery after the user has already paused.
              // Clear buffering bookkeeping, but do not announce resumed playback.
            },
          };
        }

        // Media events are delivered asynchronously and may arrive after the
        // driver has already moved on to another state, so treat them as stale.
        return { nextState: currentState };

      case EVENT.PAUSE_REQUESTED:
        if (currentState === STATE.READY_PLAYING) {
          return { nextState: STATE.READY_PAUSED, action: performPause };
        }

        if (currentState === STATE.READY_BUFFERING_PLAYING) {
          return {
            nextState: STATE.READY_BUFFERING_PAUSED,
            action: () => {
              if (ctx.audioElement) {
                ctx.audioElement.pause();
              }

              return true;
            },
          };
        }

        return { nextState: currentState, action: () => true };

      case EVENT.SEEK_REQUESTED: {
        if (currentState === STATE.COLD) {
          return {
            nextState: STATE.LOADING,
            action: () => loadPromise().then(() => seek(payload.where)),
          };
        }

        if (isBufferingState(currentState)) {
          return { nextState: currentState, action: () => false };
        }

        if (
          currentState !== STATE.READY_PRISTINE &&
          currentState !== STATE.READY_PAUSED &&
          currentState !== STATE.READY_ENDED &&
          currentState !== STATE.READY_PLAYING
        ) {
          return { nextState: currentState };
        }

        const seekOperation = payload.seekOperation;

        if (seekOperation.noOp) {
          return { nextState: currentState, action: () => false };
        }

        return {
          nextState: seekOperation.reachedEnd
            ? STATE.READY_ENDED
            : currentState === STATE.READY_PLAYING
              ? STATE.READY_STARTING
              : STATE.READY_PAUSED,
          action: () => {
            clearPoster();
            return performSeek(seekOperation, currentState);
          },
        };
      }

      case EVENT.STEP_REQUESTED: {
        if (currentState === STATE.COLD) {
          return {
            nextState: STATE.LOADING,
            action: () => loadThenReplay(EVENT.STEP_REQUESTED, payload),
          };
        }

        if (currentState === STATE.READY_PLAYING || isBufferingState(currentState)) {
          // Stepping is only defined for paused/idle states. During active
          // playback or buffering, keep the old no-op behavior.
          return { nextState: currentState };
        }

        if (
          currentState !== STATE.READY_PRISTINE &&
          currentState !== STATE.READY_PAUSED &&
          currentState !== STATE.READY_ENDED
        ) {
          return { nextState: currentState };
        }

        const step = describeStep(payload.n);

        return {
          nextState:
            step.targetIndex === undefined
              ? currentState
              : step.reachedEnd
                ? STATE.READY_ENDED
                : STATE.READY_PAUSED,
          action: () => {
            clearPoster();
            return performStep(step);
          },
        };
      }

      case EVENT.MARKER_REACHED:
        if (currentState !== STATE.READY_PLAYING) {
          return { nextState: currentState };
        }

        if (pauseOnMarkers) {
          return {
            nextState: STATE.READY_PAUSED,
            action: () => {
              dispatch("marker", payload.data);
              return performPauseAtMarker(payload.time);
            },
          };
        }

        return {
          nextState: currentState,
          action: () => dispatch("marker", payload.data),
        };

      case EVENT.STOP_REQUESTED:
        return { nextState: STATE.STOPPED, action: teardown };

      default:
        return { nextState: currentState };
    }
  }

  function enqueueEvent(event, payload = {}) {
    queuedEvents.push({ event, payload });
  }

  function processEvent(event, payload = {}) {
    const previousState = state;
    const { nextState, action } = transition(previousState, event, payload);

    if (nextState !== state) {
      state = nextState;
    }

    return action?.();
  }

  function failDriver(error) {
    queuedEvents.length = 0;
    ctx.failureError = error;
    state = STATE.FAILED;
    dispatch("error", toErrorPayload(error));
  }

  function assertCommandAllowed() {
    if (ctx.failureError) {
      throw ctx.failureError;
    }

    if (state === STATE.STOPPED) {
      throw new Error("driver has been stopped");
    }
  }

  function sendCommand(event, payload = {}) {
    assertCommandAllowed();

    return sendEvent(event, payload);
  }

  function sendEvent(event, payload = {}) {
    if (ctx.failureError || state === STATE.STOPPED) {
      // After a fatal failure or stop(), only public commands are expected to
      // observe that state. Late async facts are ignored.
      return;
    }

    if (processingEvents) {
      // Core serializes public commands, so re-entry here means the driver was
      // called directly in an unsupported way.
      throw new Error("re-entrant sendEvent() is not allowed during queue processing");
    }

    processingEvents = true;

    try {
      const result = processEvent(event, payload);

      while (queuedEvents.length > 0) {
        const queuedEvent = queuedEvents.shift();
        processEvent(queuedEvent.event, queuedEvent.payload);
      }

      return result;
    } catch (error) {
      failDriver(error);
      throw error;
    } finally {
      processingEvents = false;
      queuedEvents.length = 0;
    }
  }

  function init() {
    return sendCommand(EVENT.INIT_REQUESTED);
  }

  async function load() {
    ctx.loadingTimeout = setTimeout(() => {
      dispatch("loading");
    }, 3000);

    try {
      const parsedRecording = loadRecording(src);
      const audioLoaded = loadAudio(audioUrl);
      void audioLoaded.catch(() => {});

      const recording = prepareRecording(await parsedRecording, {
        idleTimeLimit,
        startAt,
        markers: markers_,
        inputOffset: src.inputOffset,
      });

      const hasAudio = await audioLoaded;

      ({
        cols: ctx.cols,
        rows: ctx.rows,
        events: ctx.events,
        duration: ctx.duration,
        effectiveStartAt: ctx.effectiveStartAt,
      } = recording);

      initialCols = initialCols ?? ctx.cols;
      initialRows = initialRows ?? ctx.rows;

      const theme = recording.theme ?? null;
      ctx.markers = ctx.events.filter((e) => e[1] === "m").map((e) => [e[0], e[2].label]);

      sendEvent(EVENT.LOAD_SUCCEEDED, { hasAudio, theme });
    } catch (e) {
      sendEvent(EVENT.LOAD_FAILED, { error: e });
      throw e;
    } finally {
      clearTimeout(ctx.loadingTimeout);
      ctx.loadingTimeout = null;
    }
  }

  async function loadAudio(audioUrl) {
    if (!audioUrl) return false;

    ctx.audioElement = await createAudioElement(audioUrl);

    ctx.audioSeekable =
      !Number.isNaN(ctx.audioElement.duration) &&
      ctx.audioElement.duration !== Infinity &&
      ctx.audioElement.seekable.length > 0 &&
      ctx.audioElement.seekable.end(ctx.audioElement.seekable.length - 1) ===
        ctx.audioElement.duration;

    if (ctx.audioSeekable) {
      ctx.audioElement.addEventListener("playing", onAudioPlaying);
      ctx.audioElement.addEventListener("waiting", onAudioWaiting);
    } else {
      logger.warn(
        `audio is not seekable - you must enable range request support on the server providing ${ctx.audioElement.src} for audio seeking to work`,
      );
    }

    return true;
  }

  function renderPoster() {
    if (!ctx.posterRenderableAfterLoad) return;

    if (poster.type == "npt") {
      feed(getPoster(poster.value));
    } else if (poster.type == "text") {
      feed(poster.value);
    }

    ctx.posterVisible = true;
  }

  function getPoster(time) {
    return ctx.events.filter((e) => e[0] < time && e[1] === "o").map((e) => e[2]);
  }

  function clearPoster() {
    if (ctx.posterVisible) {
      feed("\x1bc");
    }

    ctx.posterVisible = false;
    ctx.posterRenderableAfterLoad = false;
  }

  function scheduleNextEvent() {
    const nextEvent = ctx.events[ctx.nextEventIndex];

    if (nextEvent) {
      ctx.eventTimeoutId = scheduleAt(runNextEvent, nextEvent[0]);
    } else {
      if (processingEvents) {
        enqueueEvent(EVENT.PLAYBACK_ENDED);
      } else {
        sendEvent(EVENT.PLAYBACK_ENDED);
      }
    }
  }

  function scheduleAt(f, targetTime) {
    let timeout = (targetTime * 1000 - (now() - ctx.startTime)) / speed;

    if (timeout < 0) {
      timeout = 0;
    }

    return setTimeout(f, timeout);
  }

  function runNextEvent() {
    while (ctx.events[ctx.nextEventIndex] !== undefined) {
      if (executeNextEventChunk()) {
        return;
      }

      const nextEvent = ctx.events[ctx.nextEventIndex];

      if (nextEvent === undefined) {
        break;
      }

      const elapsedWallTime = now() - ctx.startTime;

      if (elapsedWallTime <= nextEvent[0] * 1000) {
        break;
      }
    }

    scheduleNextEvent();
  }

  function executeNextEventChunk() {
    const event = ctx.events[ctx.nextEventIndex];

    if (event[1] === "o") {
      executeOutputGroup();
      return false;
    }

    ctx.lastEventTime = event[0];
    ctx.nextEventIndex++;

    return executeEvent(event);
  }

  function executeOutputGroup() {
    const firstEvent = ctx.events[ctx.nextEventIndex];
    const batchDeadline = firstEvent[0] + outputBatchWindow;
    const output = [];
    let event = firstEvent;

    while (event !== undefined && event[1] === "o" && event[0] < batchDeadline) {
      output.push(event[2]);
      ctx.lastEventTime = event[0];
      ctx.nextEventIndex++;
      event = ctx.events[ctx.nextEventIndex];
    }

    feed(output);
  }

  function cancelNextEvent() {
    clearTimeout(ctx.eventTimeoutId);
    ctx.eventTimeoutId = null;
  }

  async function teardownAudio() {
    clearTimeout(ctx.waitingTimeout);

    if (ctx.audioElement) {
      ctx.audioElement.removeEventListener("playing", onAudioPlaying);
      ctx.audioElement.removeEventListener("waiting", onAudioWaiting);
      ctx.audioElement.pause();
      ctx.audioElement.src = "";
      ctx.audioElement.load();
      ctx.audioElement = undefined;
    }

    if (ctx.audioCtx) {
      await ctx.audioCtx.close();
      ctx.audioCtx = undefined;
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
      return sendEvent(EVENT.MARKER_REACHED, { data, time }) === true;
    }

    return false;
  }

  function play() {
    return sendCommand(EVENT.PLAY_REQUESTED);
  }

  function pause() {
    return sendCommand(EVENT.PAUSE_REQUESTED);
  }

  function pausePlaybackClock() {
    cancelNextEvent();
    ctx.pauseElapsedTime = now() - ctx.startTime;
  }

  function preparePlaybackClock() {
    if (ctx.audioElement && !ctx.audioCtx) setupAudioCtx();
  }

  function confirmPlaybackClockStart() {
    ctx.startTime = now() - ctx.pauseElapsedTime;
    ctx.pauseElapsedTime = null;
    scheduleNextEvent();
  }

  function seek(where) {
    assertCommandAllowed();
    validateSeekInput(where);

    if (state === STATE.COLD) {
      return sendEvent(EVENT.SEEK_REQUESTED, { where });
    }

    return sendEvent(EVENT.SEEK_REQUESTED, { seekOperation: resolveSeek(state, where) });
  }

  function findMarkerTimeBefore(time) {
    if (ctx.markers.length == 0) return;

    let i = 0;
    let marker = ctx.markers[i];
    let lastMarkerTimeBefore;

    while (marker && marker[0] < time) {
      lastMarkerTimeBefore = marker[0];
      marker = ctx.markers[++i];
    }

    return lastMarkerTimeBefore;
  }

  function findMarkerTimeAfter(time) {
    if (ctx.markers.length == 0) return;

    let i = ctx.markers.length - 1;
    let marker = ctx.markers[i];
    let firstMarkerTimeAfter;

    while (marker && marker[0] > time) {
      firstMarkerTimeAfter = marker[0];
      marker = ctx.markers[--i];
    }

    return firstMarkerTimeAfter;
  }

  function step(n) {
    return sendCommand(EVENT.STEP_REQUESTED, { n });
  }

  function getDuration() {
    return ctx.duration;
  }

  function getCurrentTime() {
    if (isPlayingState()) {
      return (now() - ctx.startTime) / 1000;
    } else {
      return (ctx.pauseElapsedTime ?? 0) / 1000;
    }
  }

  function resizeTerminalToInitialSize() {
    dispatch("resize", { cols: initialCols, rows: initialRows });
  }

  function setupAudioCtx() {
    ctx.audioCtx = new AudioContext({ latencyHint: "interactive" });
    const src = ctx.audioCtx.createMediaElementSource(ctx.audioElement);
    src.connect(ctx.audioCtx.destination);
    now = audioNow;
  }

  function audioNow() {
    if (!ctx.audioCtx) throw new Error("audio context not started - can't tell time!");

    const { contextTime, performanceTime } = ctx.audioCtx.getOutputTimestamp();

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
    sendEvent(EVENT.AUDIO_WAITING);
  }

  function onAudioPlaying() {
    logger.debug("audio resumed");
    sendEvent(EVENT.AUDIO_PLAYING);
  }

  function mute() {
    if (ctx.audioElement) {
      ctx.audioElement.muted = true;
      dispatch("muted", true);
      return true;
    }
  }

  function unmute() {
    if (ctx.audioElement) {
      ctx.audioElement.muted = false;
      dispatch("muted", false);
      return true;
    }
  }

  function stop() {
    return sendCommand(EVENT.STOP_REQUESTED);
  }

  function feed(data) {
    dispatch("output", data);
  }

  function renderTextPoster() {
    renderPoster();
    ctx.posterRenderableAfterLoad = false;
  }

  function loadThenReplay(event, payload) {
    return loadPromise().then(() => {
      return sendCommand(event, payload);
    });
  }

  function validateSeekInput(where) {
    if (typeof where === "number") {
      if (Number.isFinite(where)) return;
    } else if (typeof where === "string") {
      if (isRelativeSeek(where) || parseSeekPercentage(where) !== undefined) return;
    } else if (typeof where === "object" && where !== null) {
      if (
        where.marker === "prev" ||
        where.marker === "next" ||
        (Number.isInteger(where.marker) && where.marker >= 0)
      ) {
        return;
      }
    }

    throw new Error(`invalid seek target: ${JSON.stringify(where)}`);
  }

  function isRelativeSeek(where) {
    return where === "<<" || where === ">>" || where === "<<<" || where === ">>>";
  }

  function parseSeekPercentage(where) {
    if (!where.endsWith("%")) return;

    const percentage = Number(where.slice(0, -1));

    if (Number.isFinite(percentage)) {
      return percentage;
    }
  }

  function resolveSeek(currentState, where) {
    const currentTime = getCurrentTime();
    const isPlaying = currentState === STATE.READY_PLAYING;
    let target = where;

    if (typeof target === "string") {
      if (target === "<<") {
        target = currentTime - 5;
      } else if (target === ">>") {
        target = currentTime + 5;
      } else if (target === "<<<") {
        target = currentTime - 0.1 * ctx.duration;
      } else if (target === ">>>") {
        target = currentTime + 0.1 * ctx.duration;
      } else if (target[target.length - 1] === "%") {
        target = (parseSeekPercentage(target) / 100) * ctx.duration;
      }
    } else if (typeof target === "object") {
      if (target.marker === "prev") {
        target = findMarkerTimeBefore(currentTime) ?? 0;

        if (isPlaying && currentTime - target < 1) {
          target = findMarkerTimeBefore(target) ?? 0;
        }
      } else if (target.marker === "next") {
        target = findMarkerTimeAfter(currentTime) ?? ctx.duration;
      } else if (typeof target.marker === "number") {
        const marker = ctx.markers[target.marker];

        if (marker === undefined) {
          throw new Error(`invalid marker index: ${target.marker}`);
        }

        target = marker[0];
      }
    }

    const targetTime = Math.min(Math.max(target, 0), ctx.duration);

    return {
      targetTime,
      reachedEnd: targetTime >= ctx.duration,
      noOp: targetTime * 1000 === ctx.pauseElapsedTime,
    };
  }

  function describeStep(n = 1) {
    let nextEvent;
    let targetIndex;

    if (n > 0) {
      let index = ctx.nextEventIndex;
      nextEvent = ctx.events[index];

      for (let i = 0; i < n; i++) {
        while (nextEvent !== undefined && nextEvent[1] !== "o") {
          nextEvent = ctx.events[++index];
        }

        if (nextEvent !== undefined && nextEvent[1] === "o") {
          targetIndex = index;
          nextEvent = ctx.events[++index];
        }
      }
    } else {
      let index = Math.max(ctx.nextEventIndex - 2, 0);
      nextEvent = ctx.events[index];

      for (let i = n; i < 0; i++) {
        while (nextEvent !== undefined && nextEvent[1] !== "o") {
          nextEvent = ctx.events[--index];
        }

        if (nextEvent !== undefined && nextEvent[1] === "o") {
          targetIndex = index;
          nextEvent = ctx.events[--index];
        }
      }
    }

    return {
      n,
      targetIndex,
      reachedEnd: targetIndex !== undefined && ctx.events[targetIndex + 1] === undefined,
    };
  }

  function resetTerminal() {
    feed("\x1bc");
    resizeTerminalToInitialSize();
  }

  function syncToTime(targetTime) {
    if (targetTime < ctx.lastEventTime) {
      resetTerminal();
      ctx.nextEventIndex = 0;
      ctx.lastEventTime = 0;
    }

    let event = ctx.events[ctx.nextEventIndex];
    let output = [];

    while (event && event[0] <= targetTime) {
      if (event[1] === "o") {
        output.push(event[2]);
      } else if (event[1] === "r") {
        if (output.length > 0) {
          feed(output);
          output = [];
        }

        executeEvent(event);
      }

      ctx.lastEventTime = event[0];
      event = ctx.events[++ctx.nextEventIndex];
    }

    if (output.length > 0) {
      feed(output);
    }

    ctx.pauseElapsedTime = targetTime * 1000;
    ctx.effectiveStartAt = null;

    if (ctx.audioElement && ctx.audioSeekable) {
      ctx.audioElement.currentTime = targetTime / speed;
    }
  }

  function startPlayback(confirmedEvent) {
    if (ctx.events[ctx.nextEventIndex] === undefined) {
      syncToTime(0);
    } else if (ctx.effectiveStartAt !== null) {
      syncToTime(ctx.effectiveStartAt);
    }

    preparePlaybackClock();

    if (ctx.audioElement) {
      return ctx.audioElement.play().then(
        () => sendEvent(confirmedEvent),
        (error) => {
          sendEvent(EVENT.PLAYBACK_START_FAILED);
          throw error;
        },
      );
    }

    enqueueEvent(confirmedEvent);
    return true;
  }

  function performPause() {
    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    pausePlaybackClock();
    dispatch("pause");

    return true;
  }

  function performSeek(seekOperation, previousState) {
    const wasPlaying = previousState === STATE.READY_PLAYING;

    if (wasPlaying) {
      pausePlaybackClock();
    }

    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    syncToTime(seekOperation.targetTime);

    if (seekOperation.reachedEnd) {
      dispatch("seeked");
      dispatch("ended");
      return true;
    }

    if (wasPlaying) {
      return startPlayback(EVENT.SEEK_PLAYBACK_START_CONFIRMED);
    }

    dispatch("seeked");

    return true;
  }

  function performStep(step) {
    if (step.targetIndex === undefined) return;

    if (step.n < 0) {
      resetTerminal();
      ctx.nextEventIndex = 0;
      ctx.lastEventTime = 0;
    }

    let nextEvent;
    let output = [];

    while (ctx.nextEventIndex <= step.targetIndex) {
      nextEvent = ctx.events[ctx.nextEventIndex++];

      if (nextEvent[1] === "o") {
        output.push(nextEvent[2]);
      } else if (nextEvent[1] === "r") {
        if (output.length > 0) {
          feed(output);
          output = [];
        }

        executeEvent(nextEvent);
      }
    }

    if (output.length > 0) {
      feed(output);
    }

    ctx.lastEventTime = nextEvent[0];
    ctx.pauseElapsedTime = ctx.lastEventTime * 1000;
    ctx.effectiveStartAt = null;

    if (ctx.audioElement && ctx.audioSeekable) {
      ctx.audioElement.currentTime = ctx.lastEventTime / speed;
    }

    if (step.reachedEnd) {
      dispatch("ended");
    }
  }

  function restartWaitingTimeout() {
    clearTimeout(ctx.waitingTimeout);

    ctx.waitingTimeout = setTimeout(() => {
      dispatch("loading");
    }, 1000);
  }

  function clearWaitingTimeout() {
    clearTimeout(ctx.waitingTimeout);
    ctx.waitingTimeout = null;
  }

  function restartLoop() {
    cancelNextEvent();
    ctx.playCount++;
    ctx.nextEventIndex = 0;
    ctx.startTime = now();
    ctx.pauseElapsedTime = null;
    resetTerminal();

    if (ctx.audioElement && ctx.audioSeekable) {
      ctx.audioElement.currentTime = 0;
    }

    scheduleNextEvent();
  }

  function finishPlayback() {
    cancelNextEvent();
    ctx.playCount++;
    ctx.pauseElapsedTime = ctx.duration * 1000;

    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    dispatch("ended");
  }

  function performPauseAtMarker(time) {
    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    pausePlaybackClock();
    ctx.pauseElapsedTime = time * 1000;
    dispatch("pause");

    return true;
  }

  function teardown() {
    clearTimeout(ctx.loadingTimeout);
    ctx.loadingTimeout = null;
    clearWaitingTimeout();
    cancelNextEvent();

    return teardownAudio();
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

function prepareRecording(recording, { startAt = 0, idleTimeLimit, inputOffset, markers }) {
  let { events } = recording;

  if (!(events instanceof Stream)) {
    events = new Stream(events);
  }

  idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit ?? Infinity;
  const limiterOutput = { offset: 0 };

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
