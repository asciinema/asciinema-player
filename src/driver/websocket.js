import getBuffer from "../buffer";
import { alisHandler } from "./websocket/alis";
import { jsonHandler } from "./websocket/json";
import { rawHandler } from "./websocket/raw";
import { Clock, NullClock } from "../clock";
import { PrefixedLogger } from "../logging";

function exponentialDelay(attempt) {
  return Math.min(500 * Math.pow(2, attempt), 5000);
}

function websocket(
  { url, bufferTime, reconnectDelay = exponentialDelay, minFrameTime },
  { feed, reset, resize, setState, logger },
) {
  logger = new PrefixedLogger(logger, "websocket: ");
  let socket;
  let buf;
  let clock = new NullClock();
  let reconnectAttempt = 0;
  let successfulConnectionTimeout;
  let stop = false;
  let wasOnline = false;
  let initTimeout;

  function connect() {
    socket = new WebSocket(url, ["v1.alis", "v2.asciicast", "raw"]);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      const proto = socket.protocol || "raw";

      logger.info("opened");
      logger.info(`activating ${proto} protocol handler`);

      if (proto === "v1.alis") {
        socket.onmessage = onMessage(alisHandler(logger));
      } else if (proto === "v2.asciicast") {
        socket.onmessage = onMessage(jsonHandler());
      } else if (proto === "raw") {
        socket.onmessage = onMessage(rawHandler());
      }

      successfulConnectionTimeout = setTimeout(() => {
        reconnectAttempt = 0;
      }, 1000);
    };

    socket.onclose = (event) => {
      clearTimeout(initTimeout);
      stopBuffer();

      if (stop || event.code === 1000 || event.code === 1005) {
        logger.info("closed");
        setState("ended", { message: "Stream ended" });
      } else if (event.code === 1002) {
        logger.debug(`close reason: ${event.reason}`);
        setState("ended", { message: "Err: Player not compatible with the server" });
      } else {
        clearTimeout(successfulConnectionTimeout);
        const delay = reconnectDelay(reconnectAttempt++);
        logger.info(`unclean close, reconnecting in ${delay}...`);
        setState("loading");
        setTimeout(connect, delay);
      }
    };

    wasOnline = false;
  }

  function onMessage(handler) {
    initTimeout = setTimeout(enterOfflineMode, 5000);

    return function (event) {
      const result = handler(event.data);

      if (buf) {
        if (Array.isArray(result)) {
          buf.pushEvent(result);
        } else if (typeof result === "string") {
          buf.pushText(result);
        } else if (result === false) {
          // EOT
          enterOfflineMode();
        } else if (result !== undefined) {
          throw `unexpected value from protocol handler: ${result}`;
        }
      } else {
        if (typeof result === "object" && !Array.isArray(result)) {
          const { time, term } = result;
          const { size, init, theme } = term;
          const { cols, rows } = size;
          enterOnlineMode(cols, rows, time, init, theme);
          clearTimeout(initTimeout);
        } else if (result === undefined) {
          clearTimeout(initTimeout);
          initTimeout = setTimeout(enterOfflineMode, 1000);
        } else {
          clearTimeout(initTimeout);
          throw `unexpected value from protocol handler: ${result}`;
        }
      }
    };
  }

  function enterOnlineMode(cols, rows, time, init, theme) {
    logger.info(`stream init (${cols}x${rows} @${time})`);
    setState("playing");
    stopBuffer();
    buf = getBuffer(bufferTime, feed, resize, (t) => clock.setTime(t), time, minFrameTime, logger);
    reset(cols, rows, init, theme);
    clock = new Clock();
    wasOnline = true;

    if (typeof time === "number") {
      clock.setTime(time);
    }
  }

  function enterOfflineMode() {
    stopBuffer();

    if (wasOnline) {
      logger.info("stream ended");
      setState("offline", { message: "Stream ended" });
    } else {
      logger.info("stream offline");
      setState("offline", { message: "Stream offline" });
    }

    clock = new NullClock();
  }

  function stopBuffer() {
    if (buf) buf.stop();
    buf = null;
  }

  return {
    play: () => {
      connect();
    },

    stop: () => {
      stop = true;
      stopBuffer();
      if (socket !== undefined) socket.close();
    },

    getCurrentTime: () => clock.getTime(),
  };
}

export default websocket;
