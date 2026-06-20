import Stream from "../stream";
import { toErrorPayload } from "../error";
import { normalizeTheme } from "../theme";

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
    audioUrl,
  },
) {
  const STATE = {
    COLD: "cold", // Recording has not been loaded yet.
    LOADING: "loading", // Recording/audio load is in progress.
    READY_INITIAL: "ready.initial", // Loaded, not yet played or navigated.
    READY_PAUSED: "ready.paused", // Loaded and positioned while playback clock is stopped.
    READY_STARTING: "ready.starting", // Playback start/resume requested; waiting for clock readiness.
    READY_PLAYING: "ready.playing", // Playback clock is running and events are scheduled.
    READY_BUFFERING_WHILE_PAUSED: "ready.buffering.whilePaused", // Buffering audio, but stay paused.
    READY_BUFFERING_TO_RESUME: "ready.buffering.toResume", // Buffering audio, then resume playback.
    READY_ENDED: "ready.ended", // Playback or navigation reached recording duration.
    FAILED: "failed", // Fatal driver error; public commands reject.
    STOPPED: "stopped", // Terminal state after stop().
  };

  const EVENT = {
    INIT_REQUESTED: "initRequested", // Public init/preload command.
    PLAY_REQUESTED: "playRequested", // Public play command.
    DEFERRED_PLAY_READY: "deferredPlayReady", // Cold play() can continue after load.
    PAUSE_REQUESTED: "pauseRequested", // Public pause command.
    SEEK_REQUESTED: "seekRequested", // Public seek command.
    STEP_REQUESTED: "stepRequested", // Public frame-step command.
    STOP_REQUESTED: "stopRequested", // Public teardown command.
    LOAD_SUCCEEDED: "loadSucceeded", // Recording load completed.
    LOAD_FAILED: "loadFailed", // Recording load failed fatally.
    PLAYBACK_START_CONFIRMED: "playbackStartConfirmed", // Playback clock can start.
    PLAYBACK_START_REJECTED: "playbackStartRejected", // Audio/media play() rejected.
    PLAYBACK_ENDED: "playbackEnded", // Scheduled playback reached natural end.
    AUDIO_WAITING: "audioWaiting", // Audio element entered buffering.
    AUDIO_PLAYING: "audioPlaying", // Audio element resumed from buffering.
    SEGMENT_WAITING: "segmentWaiting", // Required segment is loading at a boundary.
    SEGMENT_READY: "segmentReady", // Required segment loaded and playback may continue.
    MARKER_REACHED: "markerReached", // Playback crossed a marker event.
  };

  const PLAYBACK_START_REASON = {
    PLAY: "play",
    SEEK: "seek",
  };

  const outputBatchWindow = (src.minFrameTime ?? 1 / 60) * 1000;
  let now = () => performance.now() * speed;
  let state = STATE.COLD;
  let queuedEvents = [];
  let processingEvents = false;

  const ctx = {
    recording: undefined,
    segmentIndex: undefined,
    segment: undefined,
    segmentCache: new Map(),
    positionGeneration: 0,
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
    segmentWaiting: false,
  };

  function isPlayingState(value = state) {
    return value === STATE.READY_PLAYING;
  }

  function isBufferingForAudioState(value = state) {
    return (
      value === STATE.READY_BUFFERING_WHILE_PAUSED || value === STATE.READY_BUFFERING_TO_RESUME
    );
  }

  function canLoopPlayback() {
    return loop === true || (typeof loop === "number" && ctx.playCount < loop);
  }

  function loadPromise(initialTime) {
    if (ctx.loaded === undefined) {
      ctx.loaded = load(initialTime);
      void ctx.loaded.catch(() => {});
    }

    return ctx.loaded;
  }

  // Public command events (INIT_REQUESTED, PLAY_REQUESTED, PAUSE_REQUESTED,
  // SEEK_REQUESTED, STEP_REQUESTED, STOP_REQUESTED) are serialized by Core
  // and are considered re-entrancy safe.
  //
  // Primary non-stale state transitions:
  // COLD -> [INIT_REQUESTED] -> LOADING
  // COLD -> [PLAY_REQUESTED | SEEK_REQUESTED | STEP_REQUESTED] -> LOADING
  // LOADING -> [LOAD_SUCCEEDED] -> READY_INITIAL
  // LOADING -> [LOAD_FAILED] -> FAILED
  // READY_INITIAL -> [PLAY_REQUESTED | DEFERRED_PLAY_READY] -> READY_STARTING
  // READY_INITIAL -> [SEEK_REQUESTED | STEP_REQUESTED] -> READY_PAUSED
  // READY_PAUSED -> [PLAY_REQUESTED] -> READY_STARTING
  // READY_PAUSED -> [SEEK_REQUESTED | STEP_REQUESTED] -> READY_PAUSED
  // READY_ENDED -> [PLAY_REQUESTED] -> READY_STARTING
  // READY_ENDED -> [SEEK_REQUESTED | STEP_REQUESTED] -> READY_PAUSED
  // READY_STARTING -> [PLAYBACK_START_CONFIRMED] -> READY_PLAYING
  // READY_STARTING -> [PLAYBACK_START_REJECTED] -> READY_PAUSED
  // READY_PLAYING -> [PAUSE_REQUESTED] -> READY_PAUSED
  // READY_PLAYING -> [SEEK_REQUESTED] -> READY_STARTING
  // READY_PLAYING -> [AUDIO_WAITING] -> READY_BUFFERING_TO_RESUME
  // READY_PLAYING -> [MARKER_REACHED] -> READY_PAUSED (pauseOnMarkers)
  // READY_BUFFERING_TO_RESUME -> [PAUSE_REQUESTED] -> READY_BUFFERING_WHILE_PAUSED
  // READY_BUFFERING_TO_RESUME -> [AUDIO_PLAYING] -> READY_PLAYING
  // READY_BUFFERING_WHILE_PAUSED -> [PLAY_REQUESTED] -> READY_BUFFERING_TO_RESUME
  // READY_BUFFERING_WHILE_PAUSED -> [AUDIO_PLAYING] -> READY_PAUSED
  // READY_BUFFERING_TO_RESUME -> [PLAYBACK_START_REJECTED] -> READY_BUFFERING_WHILE_PAUSED
  // READY_PLAYING -> [PLAYBACK_ENDED] -> READY_ENDED | READY_PLAYING (loop)
  // COLD | READY_INITIAL | READY_PAUSED | READY_PLAYING
  //   | READY_BUFFERING_WHILE_PAUSED | READY_BUFFERING_TO_RESUME | READY_ENDED
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
          nextState: STATE.READY_INITIAL,
          action: () => {
            dispatch("metadata", {
              duration: ctx.duration / 1000,
              markers: ctx.markers.map(([t, label]) => [t / 1000, label]),
              hasAudio: payload.hasAudio,
            });

            dispatch("reset", {
              size: {
                cols: ctx.segment.snapshot.cols,
                rows: ctx.segment.snapshot.rows,
              },
              init: ctx.segment.snapshot.init,
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
              return loadPromise().then(() => sendEvent(EVENT.DEFERRED_PLAY_READY));
            },
          };
        }

        if (
          currentState === STATE.READY_INITIAL ||
          currentState === STATE.READY_PAUSED ||
          currentState === STATE.READY_ENDED
        ) {
          return {
            nextState: STATE.READY_STARTING,
            action: () => {
              dispatch("play");
              clearPoster();
              return startPlayback(PLAYBACK_START_REASON.PLAY);
            },
          };
        }

        if (currentState === STATE.READY_BUFFERING_WHILE_PAUSED) {
          return {
            nextState: STATE.READY_BUFFERING_TO_RESUME,
            action: () => {
              dispatch("play");

              if (ctx.segmentWaiting) return true;

              if (ctx.audioElement) {
                return ctx.audioElement.play().catch((error) => {
                  sendEvent(EVENT.PLAYBACK_START_REJECTED);
                  throw error;
                });
              }

              return true;
            },
          };
        }

        if (
          currentState === STATE.READY_BUFFERING_TO_RESUME ||
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

      case EVENT.DEFERRED_PLAY_READY:
        if (currentState === STATE.READY_INITIAL) {
          return {
            nextState: STATE.READY_STARTING,
            action: () => {
              clearPoster();
              return startPlayback(PLAYBACK_START_REASON.PLAY);
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

            if (payload.reason === PLAYBACK_START_REASON.SEEK) {
              dispatch("seeked");
            } else {
              dispatch("playing");
            }

            return true;
          },
        };

      case EVENT.PLAYBACK_START_REJECTED:
        if (currentState === STATE.READY_STARTING) {
          return {
            nextState: STATE.READY_PAUSED,
          };
        }

        if (currentState === STATE.READY_BUFFERING_TO_RESUME) {
          return {
            nextState: STATE.READY_BUFFERING_WHILE_PAUSED,
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
            nextState: STATE.READY_BUFFERING_TO_RESUME,
            action: () => {
              logger.debug("pausing session playback");
              pausePlaybackClock();
              restartWaitingTimeout();
            },
          };
        }

        if (
          currentState === STATE.READY_BUFFERING_WHILE_PAUSED ||
          currentState === STATE.READY_BUFFERING_TO_RESUME
        ) {
          return {
            nextState: currentState,
            action: restartWaitingTimeout,
          };
        }

        return { nextState: currentState };

      case EVENT.AUDIO_PLAYING:
        if (currentState === STATE.READY_BUFFERING_TO_RESUME) {
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

        if (currentState === STATE.READY_BUFFERING_WHILE_PAUSED) {
          return {
            nextState: STATE.READY_PAUSED,
            action: () => {
              clearWaitingTimeout();
              // The media element may report recovery after the user has already paused.
              // Clear waiting bookkeeping, but do not announce resumed playback.
            },
          };
        }

        // Media events are delivered asynchronously and may arrive after the
        // driver has already moved on to another state, so treat them as stale.
        return { nextState: currentState };

      case EVENT.SEGMENT_WAITING:
        if (currentState === STATE.READY_PLAYING) {
          return {
            nextState: STATE.READY_BUFFERING_TO_RESUME,
            action: () => {
              ctx.segmentWaiting = true;
              pausePlaybackAt(payload.time);
              restartWaitingTimeout();

              if (ctx.audioElement) {
                ctx.audioElement.pause();
              }
            },
          };
        }

        return { nextState: currentState };

      case EVENT.SEGMENT_READY:
        ctx.segmentWaiting = false;

        if (currentState === STATE.READY_BUFFERING_TO_RESUME) {
          return {
            nextState: currentState,
            action: resumeAfterSegmentWait,
          };
        }

        if (currentState === STATE.READY_BUFFERING_WHILE_PAUSED) {
          return {
            nextState: STATE.READY_PAUSED,
            action: clearWaitingTimeout,
          };
        }

        return { nextState: currentState };

      case EVENT.PAUSE_REQUESTED:
        if (currentState === STATE.READY_PLAYING) {
          return { nextState: STATE.READY_PAUSED, action: performPause };
        }

        if (currentState === STATE.READY_BUFFERING_TO_RESUME) {
          return {
            nextState: STATE.READY_BUFFERING_WHILE_PAUSED,
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
            action: () =>
              loadPromise(
                typeof payload.where === "number" ? payload.where * 1000 : undefined,
              ).then(() => seek(payload.where)),
          };
        }

        if (isBufferingForAudioState(currentState) && !ctx.segmentWaiting) {
          return { nextState: currentState, action: () => false };
        }

        if (
          currentState !== STATE.READY_INITIAL &&
          currentState !== STATE.READY_PAUSED &&
          currentState !== STATE.READY_ENDED &&
          currentState !== STATE.READY_PLAYING &&
          currentState !== STATE.READY_BUFFERING_WHILE_PAUSED &&
          currentState !== STATE.READY_BUFFERING_TO_RESUME
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
            : currentState === STATE.READY_PLAYING ||
                currentState === STATE.READY_BUFFERING_TO_RESUME
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
            action: () => loadPromise().then(() => sendCommand(EVENT.STEP_REQUESTED, payload)),
          };
        }

        if (currentState === STATE.READY_PLAYING || isBufferingForAudioState(currentState)) {
          // Stepping is only defined for paused/idle states. During active
          // playback or audio buffering, step() is a no-op.
          return { nextState: currentState };
        }

        if (
          currentState !== STATE.READY_INITIAL &&
          currentState !== STATE.READY_PAUSED &&
          currentState !== STATE.READY_ENDED
        ) {
          return { nextState: currentState };
        }

        return {
          nextState: STATE.READY_PAUSED,
          action: () => {
            clearPoster();
            return performStep(payload.n);
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
              dispatchMarker(payload.data);
              return performPauseAtMarker(payload.time);
            },
          };
        }

        return {
          nextState: currentState,
          action: () => dispatchMarker(payload.data),
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
      // Terminal states reject public commands via sendCommand(); late async
      // facts from timers/media callbacks are ignored here.
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

  async function load(requestedInitialTime) {
    ctx.loadingTimeout = setTimeout(() => {
      dispatch("loading");
    }, 3000);

    try {
      validateSegmentedOptions(src, { idleTimeLimit, markers: markers_ });
      const loadedRecording = loadRecordingSource(src, {
        idleTimeLimit,
        startAt,
        markers: markers_,
        inputOffset: src.inputOffset,
      });

      const audioLoaded = loadAudio(audioUrl).catch((error) => {
        logger.warn(`audio load failed: ${error.message}`);
        return false;
      });

      const recording = await loadedRecording;

      ctx.recording = recording;
      ctx.duration = recording.duration;
      ctx.effectiveStartAt = recording.effectiveStartAt;
      ctx.markers = recording.markers;

      const initialTime =
        requestedInitialTime ??
        (poster?.type === "npt" ? poster.value * 1000 : ctx.effectiveStartAt);
      const segmentIndex = findSegmentIndex(recording, initialTime ?? 0);
      const segment = await getSegment(segmentIndex, true);
      activateSegment(segmentIndex, segment);

      const hasAudio = await audioLoaded;

      const theme = recording.theme ?? null;
      sendEvent(EVENT.LOAD_SUCCEEDED, { hasAudio, theme });
    } catch (e) {
      if (processingEvents) {
        enqueueEvent(EVENT.LOAD_FAILED, { error: e });
      } else {
        sendEvent(EVENT.LOAD_FAILED, { error: e });
      }

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
      syncActiveSegmentToTime(poster.value * 1000, false, false);
    } else if (poster.type == "text") {
      feed(poster.value);
    }

    ctx.posterVisible = true;
  }

  function clearPoster() {
    if (ctx.posterVisible) {
      feed("\x1bc");
    }

    ctx.posterVisible = false;
    ctx.posterRenderableAfterLoad = false;
  }

  function activateSegment(index, segment) {
    ctx.segmentIndex = index;
    ctx.segment = segment;
    ctx.nextEventIndex = 0;
    ctx.lastEventTime = ctx.recording.segments[index].start;
  }

  function getSegment(index, required = false) {
    let entry = ctx.segmentCache.get(index);

    if (entry === undefined) {
      entry = {};
      entry.promise = ctx.recording.loadSegment(ctx.recording.segments[index]).then(
        (data) => {
          if (ctx.segmentCache.get(index) === entry) {
            entry.data = data;
          }

          return data;
        },
        (error) => {
          if (ctx.segmentCache.get(index) === entry) {
            ctx.segmentCache.delete(index);
          }

          if (!required) {
            logger.warn(`segment prefetch failed: ${error.message}`);
          }

          throw error;
        },
      );
      ctx.segmentCache.set(index, entry);

      if (!required) {
        void entry.promise.catch(() => {});
      }
    }

    return entry.promise;
  }

  function retainSegments(indexes) {
    const retained = new Set(indexes.filter((index) => index >= 0));

    for (const index of ctx.segmentCache.keys()) {
      if (!retained.has(index)) {
        ctx.segmentCache.delete(index);
      }
    }
  }

  function prefetchNextSegment() {
    const nextIndex = ctx.segmentIndex + 1;
    const retained = [ctx.segmentIndex - 1, ctx.segmentIndex, nextIndex];
    retainSegments(retained);

    if (nextIndex < ctx.recording.segments.length) {
      getSegment(nextIndex);
    } else if (canLoopPlayback()) {
      retainSegments([ctx.segmentIndex - 1, ctx.segmentIndex, 0]);
      getSegment(0);
    }
  }

  async function advanceSegment() {
    const nextIndex = ctx.segmentIndex + 1;
    const boundary = ctx.recording.segments[nextIndex].start;
    const generation = ++ctx.positionGeneration;
    const entry = ctx.segmentCache.get(nextIndex);

    if (entry?.data === undefined) {
      sendEvent(EVENT.SEGMENT_WAITING, { time: boundary });
    }

    try {
      const segment = await getSegment(nextIndex, true);

      if (generation !== ctx.positionGeneration || state === STATE.STOPPED) return;

      activateSegment(nextIndex, segment);
      prefetchNextSegment();

      if (
        state === STATE.READY_BUFFERING_TO_RESUME ||
        state === STATE.READY_BUFFERING_WHILE_PAUSED
      ) {
        await sendEvent(EVENT.SEGMENT_READY);
      } else if (state === STATE.READY_PLAYING) {
        scheduleNextEvent();
      }
    } catch (error) {
      if (generation === ctx.positionGeneration) {
        failDriver(error);
      }
    }
  }

  function pausePlaybackAt(time) {
    cancelNextEvent();
    ctx.pauseElapsedTime = time;
  }

  function resumeAfterSegmentWait() {
    clearWaitingTimeout();

    if (ctx.audioElement) {
      return ctx.audioElement.play().then(
        () => sendEvent(EVENT.AUDIO_PLAYING),
        (error) => {
          sendEvent(EVENT.PLAYBACK_START_REJECTED);
          throw error;
        },
      );
    }

    if (processingEvents) {
      enqueueEvent(EVENT.AUDIO_PLAYING);
    } else {
      sendEvent(EVENT.AUDIO_PLAYING);
    }
  }

  function scheduleNextEvent() {
    const nextEvent = ctx.segment.events[ctx.nextEventIndex];

    if (nextEvent) {
      ctx.eventTimeoutId = scheduleAt(runNextEvent, nextEvent[0]);
    } else {
      if (ctx.segmentIndex < ctx.recording.segments.length - 1) {
        const boundary = ctx.recording.segments[ctx.segmentIndex + 1].start;
        ctx.eventTimeoutId = scheduleAt(advanceSegment, boundary);
      } else {
        if (processingEvents) {
          enqueueEvent(EVENT.PLAYBACK_ENDED);
        } else {
          sendEvent(EVENT.PLAYBACK_ENDED);
        }
      }
    }
  }

  function scheduleAt(f, targetTime) {
    let timeout = (targetTime - (now() - ctx.startTime)) / speed;

    if (timeout < 0) {
      timeout = 0;
    }

    return setTimeout(f, timeout);
  }

  function runNextEvent() {
    while (ctx.segment.events[ctx.nextEventIndex] !== undefined) {
      if (executeNextEventChunk()) {
        return;
      }

      const nextEvent = ctx.segment.events[ctx.nextEventIndex];

      if (nextEvent === undefined) {
        break;
      }

      const elapsedWallTime = now() - ctx.startTime;

      if (elapsedWallTime <= nextEvent[0]) {
        break;
      }
    }

    scheduleNextEvent();
  }

  function executeNextEventChunk() {
    const event = ctx.segment.events[ctx.nextEventIndex];

    if (event[1] === "o") {
      executeOutputGroup();
      return false;
    }

    ctx.lastEventTime = event[0];
    ctx.nextEventIndex++;

    return executeEvent(event);
  }

  function executeOutputGroup() {
    const firstEvent = ctx.segment.events[ctx.nextEventIndex];
    const batchDeadline = firstEvent[0] + outputBatchWindow;
    const output = [];
    let event = firstEvent;

    while (event !== undefined && event[1] === "o" && event[0] < batchDeadline) {
      output.push(event[2]);
      ctx.lastEventTime = event[0];
      ctx.nextEventIndex++;
      event = ctx.segment.events[ctx.nextEventIndex];
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
    return ctx.duration === undefined ? undefined : ctx.duration / 1000;
  }

  function getCurrentTimeMs() {
    if (isPlayingState()) {
      return now() - ctx.startTime;
    } else {
      return ctx.pauseElapsedTime ?? 0;
    }
  }

  function getCurrentTime() {
    return getCurrentTimeMs() / 1000;
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

  function dispatchMarker(data) {
    dispatch("marker", { ...data, time: data.time / 1000 });
  }

  function renderTextPoster() {
    renderPoster();
    ctx.posterRenderableAfterLoad = false;
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
    const currentTime = getCurrentTimeMs();
    const isPlaying = currentState === STATE.READY_PLAYING;
    let target = where;

    if (typeof target === "number") {
      target = target * 1000;
    } else if (typeof target === "string") {
      if (target === "<<") {
        target = currentTime - 5000;
      } else if (target === ">>") {
        target = currentTime + 5000;
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

        if (isPlaying && currentTime - target < 1000) {
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
      noOp: targetTime === ctx.pauseElapsedTime,
    };
  }

  function restoreSegmentSnapshot(segment) {
    feed("\x1bc");
    dispatch("reset", {
      size: { cols: segment.snapshot.cols, rows: segment.snapshot.rows },
      init: segment.snapshot.init,
      theme: ctx.recording.theme ?? null,
    });
  }

  function syncActiveSegmentToTime(targetTime, clearStartAt = true, inclusive = true) {
    let event = ctx.segment.events[ctx.nextEventIndex];
    let output = [];

    while (event && (inclusive ? event[0] <= targetTime : event[0] < targetTime)) {
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
      event = ctx.segment.events[++ctx.nextEventIndex];
    }

    if (output.length > 0) {
      feed(output);
    }

    ctx.pauseElapsedTime = targetTime;
    if (clearStartAt) {
      ctx.effectiveStartAt = null;
    }

    if (ctx.audioElement && ctx.audioSeekable) {
      ctx.audioElement.currentTime = targetTime / 1000 / speed;
    }
  }

  async function positionAt(targetTime, reuseForward = false, generation) {
    const targetIndex = findSegmentIndex(ctx.recording, targetTime);

    if (generation !== undefined && generation !== ctx.positionGeneration) return false;

    if (reuseForward && targetIndex === ctx.segmentIndex && targetTime >= ctx.lastEventTime) {
      syncActiveSegmentToTime(targetTime);
      return true;
    }

    retainSegments([targetIndex - 1, targetIndex, targetIndex + 1]);
    const segment = await getSegment(targetIndex, true);

    if (generation !== undefined && generation !== ctx.positionGeneration) return false;

    activateSegment(targetIndex, segment);
    restoreSegmentSnapshot(segment);
    syncActiveSegmentToTime(targetTime);
    return true;
  }

  async function startPlayback(reason) {
    if (
      ctx.segmentIndex === ctx.recording.segments.length - 1 &&
      ctx.segment.events[ctx.nextEventIndex] === undefined
    ) {
      await positionAt(0);
    } else if (ctx.effectiveStartAt !== null) {
      await positionAt(ctx.effectiveStartAt, true);
    }

    prefetchNextSegment();

    preparePlaybackClock();

    if (ctx.audioElement) {
      try {
        await ctx.audioElement.play();
        return sendEvent(EVENT.PLAYBACK_START_CONFIRMED, { reason });
      } catch (error) {
        sendEvent(EVENT.PLAYBACK_START_REJECTED);
        throw error;
      }
    }

    if (processingEvents) {
      enqueueEvent(EVENT.PLAYBACK_START_CONFIRMED, { reason });
      return true;
    }

    return sendEvent(EVENT.PLAYBACK_START_CONFIRMED, { reason });
  }

  function performPause() {
    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    pausePlaybackClock();
    dispatch("pause");

    return true;
  }

  async function performSeek(seekOperation, previousState) {
    const wasPlaying =
      previousState === STATE.READY_PLAYING || previousState === STATE.READY_BUFFERING_TO_RESUME;
    const generation = ++ctx.positionGeneration;

    if (previousState === STATE.READY_PLAYING) {
      pausePlaybackClock();
    }

    ctx.segmentWaiting = false;

    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    if (!(await positionAt(seekOperation.targetTime, true, generation))) return false;

    if (generation !== ctx.positionGeneration) return false;

    if (seekOperation.reachedEnd) {
      dispatch("seeked");
      dispatch("ended");
      return true;
    }

    if (wasPlaying) {
      return await startPlayback(PLAYBACK_START_REASON.SEEK);
    }

    dispatch("seeked");

    return true;
  }

  async function performStep(n = 1) {
    const target = await findStepTarget(n);

    if (target === undefined) return;

    await positionAt(target.time, n > 0);

    if (ctx.audioElement && ctx.audioSeekable) {
      ctx.audioElement.currentTime = target.time / 1000 / speed;
    }

    if (target.reachedEnd) {
      state = STATE.READY_ENDED;
      dispatch("ended");
    }
  }

  async function findStepTarget(n) {
    let remaining = Math.abs(n);
    let segmentIndex = ctx.segmentIndex;
    let eventIndex = n > 0 ? ctx.nextEventIndex : ctx.nextEventIndex - 2;
    let target;

    while (segmentIndex >= 0 && segmentIndex < ctx.recording.segments.length) {
      retainSegments([segmentIndex - 1, segmentIndex, segmentIndex + 1]);
      const segment = await getSegment(segmentIndex, true);

      if (n > 0) {
        for (let i = Math.max(eventIndex, 0); i < segment.events.length; i++) {
          if (segment.events[i][1] === "o" && --remaining === 0) {
            target = { time: segment.events[i][0] };
            break;
          }
        }

        if (target) break;
        segmentIndex++;
        eventIndex = 0;
      } else {
        for (let i = Math.min(eventIndex, segment.events.length - 1); i >= 0; i--) {
          if (segment.events[i][1] === "o" && --remaining === 0) {
            target = { time: segment.events[i][0] };
            break;
          }
        }

        if (target) break;
        segmentIndex--;
        eventIndex = Number.MAX_SAFE_INTEGER;
      }
    }

    if (target) {
      target.reachedEnd = target.time >= ctx.duration;
    }

    return target;
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

  async function restartLoop() {
    cancelNextEvent();
    ctx.playCount++;
    const generation = ++ctx.positionGeneration;
    const entry = ctx.segmentCache.get(0);

    if (entry?.data === undefined) {
      sendEvent(EVENT.SEGMENT_WAITING, { time: ctx.duration });
    }

    try {
      const segment = await getSegment(0, true);

      if (generation !== ctx.positionGeneration) return;

      activateSegment(0, segment);
      restoreSegmentSnapshot(segment);
      ctx.pauseElapsedTime = 0;
      ctx.startTime = now();
      prefetchNextSegment();

      if (ctx.audioElement && ctx.audioSeekable) {
        ctx.audioElement.currentTime = 0;
      }

      if (
        state === STATE.READY_BUFFERING_TO_RESUME ||
        state === STATE.READY_BUFFERING_WHILE_PAUSED
      ) {
        await sendEvent(EVENT.SEGMENT_READY);
      } else {
        ctx.pauseElapsedTime = null;
        scheduleNextEvent();
      }
    } catch (error) {
      if (generation === ctx.positionGeneration) {
        failDriver(error);
      }
    }
  }

  function finishPlayback() {
    cancelNextEvent();
    ctx.playCount++;
    ctx.pauseElapsedTime = ctx.duration;

    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    retainSegments([ctx.segmentIndex - 1, ctx.segmentIndex]);

    dispatch("ended");
  }

  function performPauseAtMarker(time) {
    if (ctx.audioElement) {
      ctx.audioElement.pause();
    }

    pausePlaybackClock();
    ctx.pauseElapsedTime = time;
    dispatch("pause");

    return true;
  }

  function teardown() {
    ctx.positionGeneration++;
    ctx.segmentCache.clear();
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

async function loadRecordingSource(src, options) {
  if (src.format === "segmented") {
    return await loadSegmentedRecording(src, options);
  }

  return wrapFullRecording(prepareRecording(await loadRecording(src), options));
}

function wrapFullRecording(recording) {
  const segment = { start: 0 };
  const markers = recording.events
    .filter((event) => event[1] === "m")
    .map((event) => [event[0], event[2].label]);

  return {
    cols: recording.cols,
    rows: recording.rows,
    theme: recording.theme,
    duration: recording.duration,
    effectiveStartAt: recording.effectiveStartAt,
    markers,
    segments: [segment],
    async loadSegment(requestedSegment) {
      if (requestedSegment !== segment) {
        throw new Error("unknown recording segment");
      }

      return {
        snapshot: { cols: recording.cols, rows: recording.rows, init: "" },
        events: recording.events,
      };
    },
  };
}

async function loadSegmentedRecording(src, { startAt = 0 } = {}) {
  if (typeof src.url !== "string") {
    throw new Error("segmented recording source requires a URL");
  }

  const response = await doFetchOne(src.url, src.fetchOpts ?? {});
  let index;

  try {
    index = await response.json();
  } catch (error) {
    throw new Error(`failed parsing segmented recording index from ${src.url}: ${error.message}`);
  }

  validateSegmentedIndex(index);

  const duration = index.duration * 1000;
  const markers = (index.markers ?? []).map(([time, label]) => [time * 1000, label]);
  const segments = index.segments.map((segment) => ({
    start: segment.start * 1000,
    url: resolveSegmentUrl(segment.url, response.url || src.url),
  }));
  const recording = {
    cols: index.term.cols,
    rows: index.term.rows,
    theme: parseSegmentedTheme(index.term.theme),
    duration,
    effectiveStartAt: Math.min(Math.max(startAt * 1000, 0), duration),
    markers,
    segments,
    async loadSegment(segment) {
      const segmentIndex = segments.indexOf(segment);

      if (segmentIndex === -1) {
        throw new Error("unknown recording segment");
      }

      const segmentResponse = await doFetchOne(segment.url, src.fetchOpts ?? {});
      let payload;

      try {
        payload = await segmentResponse.json();
      } catch (error) {
        throw new Error(`failed parsing recording segment from ${segment.url}: ${error.message}`);
      }

      const data = normalizeSegment(recording, segmentIndex, payload);
      return data;
    },
  };

  return recording;
}

function validateSegmentedOptions(src, { idleTimeLimit, markers }) {
  if (src.format !== "segmented") return;

  const unsupported = [];

  if (idleTimeLimit !== undefined) unsupported.push("idleTimeLimit");
  if (markers !== undefined) unsupported.push("markers");

  for (const option of ["inputOffset", "parser", "encoding"]) {
    if (Object.hasOwn(src, option)) unsupported.push(option);
  }

  if (unsupported.length > 0) {
    throw new Error(`segmented recordings do not support option: ${unsupported.join(", ")}`);
  }
}

function validateSegmentedIndex(index) {
  if (index?.version !== 1) {
    throw new Error(`unsupported segmented recording version: ${JSON.stringify(index?.version)}`);
  }

  validateFiniteTime(index.duration, "recording duration");
  validateTerminalSize(index.term, "recording terminal");

  if (!Array.isArray(index.segments) || index.segments.length === 0) {
    throw new Error("segmented recording index is missing segments");
  }

  let previousStart = -1;

  index.segments.forEach((segment, i) => {
    validateFiniteTime(segment?.start, `segment ${i} start`);

    if (typeof segment?.url !== "string" || segment.url.length === 0) {
      throw new Error(`segment ${i} is missing its URL`);
    }

    if (i === 0 && segment.start !== 0) {
      throw new Error("first segment must start at 0");
    }

    if (i > 0 && (segment.start <= previousStart || segment.start >= index.duration)) {
      throw new Error(`segment ${i} start must be strictly increasing and before duration`);
    }

    previousStart = segment.start;
  });

  if (index.markers !== undefined && !Array.isArray(index.markers)) {
    throw new Error("segmented recording markers must be an array");
  }

  let previousMarkerTime = -1;

  for (const [i, marker] of (index.markers ?? []).entries()) {
    if (!Array.isArray(marker) || marker.length !== 2 || typeof marker[1] !== "string") {
      throw new Error(`invalid marker ${i} in segmented recording index`);
    }

    validateFiniteTime(marker[0], `marker ${i} time`);

    if (marker[0] < previousMarkerTime || marker[0] > index.duration) {
      throw new Error(`marker ${i} time is out of order or range`);
    }

    previousMarkerTime = marker[0];
  }
}

function normalizeSegment(recording, index, payload) {
  const snapshot = payload?.snapshot;
  validateTerminalSize(snapshot, `segment ${index} snapshot`);

  if (typeof snapshot.init !== "string") {
    throw new Error(`segment ${index} snapshot init must be a string`);
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new Error(`segment ${index} is missing events`);
  }

  const start = recording.segments[index].start;
  const end = getSegmentEnd(recording, index);
  let previousTime = -1;
  let markerIndex = recording.markers.findIndex(([time]) => time >= start);

  if (markerIndex === -1) markerIndex = recording.markers.length;

  const events = payload.events.map((event, eventIndex) => {
    if (!Array.isArray(event) || event.length !== 3 || typeof event[1] !== "string") {
      throw new Error(`invalid event ${eventIndex} in segment ${index}`);
    }

    const time = event[0] * 1000;
    validateFiniteTime(time, `event ${eventIndex} time in segment ${index}`, true);

    if (
      time < previousTime ||
      time < start ||
      (index + 1 < recording.segments.length ? time >= end : time > end)
    ) {
      throw new Error(`event ${eventIndex} time is out of range in segment ${index}`);
    }

    previousTime = time;

    if (event[1] === "m") {
      if (typeof event[2] !== "string") {
        throw new Error(`marker event ${eventIndex} in segment ${index} must have a string label`);
      }

      return [time, "m", { index: markerIndex++, time, label: event[2] }];
    }

    return [time, event[1], event[2]];
  });

  if (index > 0 && events[0][0] !== start) {
    throw new Error(`segment ${index} first event must match its start`);
  }

  if (
    index === recording.segments.length - 1 &&
    events[events.length - 1][0] !== recording.duration
  ) {
    throw new Error("final segment event must match recording duration");
  }

  return {
    snapshot: { cols: snapshot.cols, rows: snapshot.rows, init: snapshot.init },
    events,
  };
}

function validateFiniteTime(value, label, milliseconds = false) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${label} must be a finite non-negative ${milliseconds ? "millisecond" : "second"} value`,
    );
  }
}

function validateTerminalSize(term, label) {
  if (
    !Number.isInteger(term?.cols) ||
    term.cols <= 0 ||
    !Number.isInteger(term?.rows) ||
    term.rows <= 0
  ) {
    throw new Error(`${label} must have positive integer cols and rows`);
  }
}

function parseSegmentedTheme(theme) {
  return normalizeTheme({
    foreground: theme?.fg,
    background: theme?.bg,
    palette: typeof theme?.palette === "string" ? theme.palette.split(":") : undefined,
  });
}

function resolveSegmentUrl(url, indexUrl) {
  return new URL(url, new URL(indexUrl, globalThis.location?.href ?? "http://localhost/")).href;
}

function findSegmentIndex(recording, time) {
  if (time >= recording.duration) return recording.segments.length - 1;

  let low = 0;
  let high = recording.segments.length;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);

    if (recording.segments[middle].start <= time) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
}

function getSegmentEnd(recording, index) {
  return recording.segments[index + 1]?.start ?? recording.duration;
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

  startAt = startAt * 1000;
  idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit;
  idleTimeLimit = idleTimeLimit !== undefined ? idleTimeLimit * 1000 : Infinity;
  inputOffset = inputOffset !== undefined ? inputOffset * 1000 : undefined;
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
  return typeof m === "number" ? [m * 1000, "m", ""] : [m[0] * 1000, "m", m[1]];
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
export { loadRecording, loadSegmentedRecording, prepareRecording };
