import getBuffer from "../buffer";
import { alisHandler } from "./websocket/alis";
import { ascicastV2Handler } from "./websocket/asciicast-v2";
import { ascicastV3Handler } from "./websocket/asciicast-v3";
import { rawHandler } from "./websocket/raw";
import { Clock } from "../clock";
import { PrefixedLogger } from "../logging";

const RECONNECT_DELAY_BASE = 500;
const RECONNECT_DELAY_CAP = 10000;

function exponentialDelay(attempt) {
  const base = Math.min(RECONNECT_DELAY_BASE * Math.pow(2, attempt), RECONNECT_DELAY_CAP);
  return Math.random() * base;
}

function websocket(
  { url, bufferTime, reconnectDelay = exponentialDelay, minFrameTime },
  { dispatch, logger },
  { audioUrl },
) {
  logger = new PrefixedLogger(logger, "websocket: ");
  const clock = new Clock((timing) => dispatch("timing", timing));
  let socket;
  let buf;
  let reconnectAttempt = 0;
  let successfulConnectionTimeout;
  let reconnectTimeout;
  let stop = false;
  let wasOnline = false;
  let gotExitEvent = false;
  let gotEotEvent = false;
  let initTimeout;
  let audioElement;

  function connect() {
    if (stop) return;

    socket = new WebSocket(url, ["v1.alis", "v2.asciicast", "v3.asciicast", "raw"]);
    socket.binaryType = "arraybuffer";
    let proto;

    socket.onopen = () => {
      proto = socket.protocol || "raw";

      logger.info("opened");
      logger.info(`activating ${proto} protocol handler`);

      if (proto === "v1.alis") {
        socket.onmessage = onMessage(alisHandler(logger));
      } else if (proto === "v2.asciicast") {
        socket.onmessage = onMessage(ascicastV2Handler());
      } else if (proto === "v3.asciicast") {
        socket.onmessage = onMessage(ascicastV3Handler());
      } else if (proto === "raw") {
        socket.onmessage = onMessage(rawHandler());
      }

      successfulConnectionTimeout = setTimeout(() => {
        reconnectAttempt = 0;
      }, 1000);
    };

    socket.onclose = (event) => {
      clearTimeout(initTimeout);
      clearTimeout(successfulConnectionTimeout);

      if (stop) return;

      stopBuffer();
      let ended = false;
      let endedMessage = "Stream ended";

      if (proto === "v1.alis") {
        if (gotEotEvent || (event.code >= 4000 && event.code <= 4100)) {
          ended = true;
          endedMessage = event.reason || endedMessage;
        }
      } else if (gotExitEvent || event.code === 1000 || event.code === 1005) {
        ended = true;
      }

      if (ended) {
        logger.info("closed");
        dispatch("ended", { message: endedMessage });
      } else if (event.code === 1002) {
        logger.debug(`close reason: ${event.reason}`);
        dispatch("ended", { message: "Err: Player not compatible with the server" });
      } else {
        const delay = reconnectDelay(reconnectAttempt++);
        logger.info(`unexpected close, reconnecting in ${delay}...`);
        dispatch("loading");
        reconnectTimeout = setTimeout(connect, delay);
      }
    };

    wasOnline = false;
  }

  function onMessage(handler) {
    initTimeout = setTimeout(onStreamEnd, 5000);

    return function (event) {
      try {
        const result = handler(event.data);

        if (buf) {
          if (Array.isArray(result)) {
            buf.pushEvent(result);

            if (result[1] === "x") {
              gotExitEvent = true;
            }
          } else if (typeof result === "string") {
            buf.pushText(result);
          } else if (typeof result === "object" && !Array.isArray(result)) {
            // TODO: check last event ID from the parser, don't reset if we didn't miss anything
            onStreamReset(result);
          } else if (result === false) {
            // EOT
            onStreamEnd();
            gotEotEvent = true;
          } else if (result !== undefined) {
            throw new Error(`unexpected value from protocol handler: ${result}`);
          }
        } else {
          if (typeof result === "object" && !Array.isArray(result)) {
            onStreamReset(result);
            clearTimeout(initTimeout);
          } else if (result === undefined) {
            clearTimeout(initTimeout);
            initTimeout = setTimeout(onStreamEnd, 1000);
          } else {
            clearTimeout(initTimeout);
            throw new Error(`unexpected value from protocol handler: ${result}`);
          }
        }
      } catch (e) {
        socket.close();
        throw e;
      }
    };
  }

  function onStreamReset({ time, term }) {
    const { size, init, theme } = term;
    const { cols, rows } = size;
    logger.info(`stream reset (${cols}x${rows} @${time})`);
    stopBuffer();

    buf = getBuffer(
      bufferTime,
      dispatch,
      (t) => clock.setTime(t / 1000, 1),
      time,
      minFrameTime,
      logger,
    );

    dispatch("reset", { size: { cols, rows }, init, theme: theme ?? null });
    wasOnline = true;
    gotExitEvent = false;
    gotEotEvent = false;

    clock.setTime((time ?? 0) / 1000, 1);
    dispatch("playing");
  }

  function onStreamEnd() {
    stopBuffer();

    if (wasOnline) {
      logger.info("stream ended");
      dispatch("offline", { message: "Stream ended" });
    } else {
      logger.info("stream offline");
      dispatch("offline", { message: "Stream offline" });
    }
  }

  function stopBuffer() {
    if (buf) buf.stop();
    buf = null;
    clock.stop();
  }

  function startAudio() {
    if (!audioUrl) return;

    audioElement = new Audio();
    audioElement.preload = "auto";
    audioElement.crossOrigin = "anonymous";
    audioElement.src = audioUrl;
    audioElement.play();
  }

  function stopAudio() {
    if (!audioElement) return;

    audioElement.pause();
  }

  function mute() {
    if (audioElement) {
      audioElement.muted = true;
      return true;
    }
  }

  function unmute() {
    if (audioElement) {
      audioElement.muted = false;
      return true;
    }
  }

  return {
    init: () => {
      dispatch("metadata", { hasAudio: !!audioUrl });
    },

    play: () => {
      if (socket) return true;

      dispatch("play");
      connect();
      startAudio();

      return true;
    },

    stop: () => {
      stop = true;
      clearTimeout(initTimeout);
      clearTimeout(successfulConnectionTimeout);
      clearTimeout(reconnectTimeout);
      stopBuffer();
      if (socket !== undefined) socket.close();
      stopAudio();
    },

    mute,
    unmute,

    getTiming: () => clock.getTiming(),
  };
}

export default websocket;
