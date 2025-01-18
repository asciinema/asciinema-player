import getBuffer from "../buffer";
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

  function initBuffer(baseStreamTime) {
    if (buf !== undefined) buf.stop();

    buf = getBuffer(
      bufferTime,
      feed,
      resize,
      (t) => clock.setTime(t),
      baseStreamTime,
      minFrameTime,
      logger,
    );
  }

  function handleResetMessage(cols, rows, time, init, theme) {
    logger.debug(`stream reset (${cols}x${rows} @${time})`);
    setState("playing");
    initBuffer(time);
    reset(cols, rows, init, theme);
    clock = new Clock();
    wasOnline = true;

    if (typeof time === "number") {
      clock.setTime(time);
    }
  }

  function handleOfflineMessage() {
    logger.info("stream offline");

    if (wasOnline) {
      setState("offline", { message: "Stream ended" });
    } else {
      setState("offline", { message: "Stream offline" });
    }

    clock = new NullClock();
  }

  function connect() {
    socket = new WebSocket(url, ["v1.alis", "v2.asciicast", "raw"]);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      const proto = socket.protocol || "raw";

      logger.info("opened");
      logger.info(`activating ${proto} protocol handler`);

      initBuffer();

      if (proto === "v1.alis") {
        socket.onmessage = getAlisHandler();
      } else if (proto === "v2.asciicast") {
        socket.onmessage = getJsonHandler();
      } else if (proto === "raw") {
        socket.onmessage = getRawHandler();
      }

      successfulConnectionTimeout = setTimeout(() => {
        reconnectAttempt = 0;
      }, 1000);
    };

    socket.onclose = (event) => {
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

  function getAlisHandler() {
    const outputDecoder = new TextDecoder();
    const inputDecoder = new TextDecoder();
    let firstMessage = true;

    return function(event) {
      const buffer = event.data;
      const view = new DataView(buffer);
      const type = view.getUint8(0);
      let offset = 1;

      if (!firstMessage) {
        if (type === 0x6f) {
          // 'o' - output
          const time = view.getFloat32(1, true);
          const len = view.getUint32(5, true);
          const text = outputDecoder.decode(new Uint8Array(buffer, 9, len));
          buf.pushEvent([time, "o", text]);
        } else if (type === 0x69) {
          // 'i' - input
          const time = view.getFloat32(1, true);
          const len = view.getUint32(5, true);
          const text = inputDecoder.decode(new Uint8Array(buffer, 9, len));
          buf.pushEvent([time, "i", text]);
        } else if (type === 0x72) {
          // 'r' - resize
          const time = view.getFloat32(1, true);
          const cols = view.getUint16(5, true);
          const rows = view.getUint16(7, true);
          buf.pushEvent([time, "r", `${cols}x${rows}`]);
        } else if (type === 0x6d) {
          // 'm' - marker
          const time = view.getFloat32(1, true);
          const len = view.getUint32(5, true);
          const decoder = new TextDecoder();
          const text = decoder.decode(new Uint8Array(buffer, 9, len));
          buf.pushEvent([time, "m", text]);
        } else if (type === 0x04) {
          // offline (EOT)
          const time = view.getFloat32(1, true);
          buf.pushEvent([time, "x", handleOfflineMessage]);
        } else {
          logger.debug(`unknown event type: ${type}`);
        }
      } else {
        firstMessage = false;

        if (type === 0x01) {
          // 0x01 - reset
          const cols = view.getUint16(offset, true);
          offset += 2;
          const rows = view.getUint16(offset, true);
          offset += 2;
          const time = view.getFloat32(offset, true);
          offset += 4;
          const themeFormat = view.getUint8(offset);
          offset += 1;
          let theme;

          if (themeFormat === 8) {
            const len = (2 + 8) * 3;
            theme = parseTheme(new Uint8Array(buffer, offset, len));
            offset += len;
          } else if (themeFormat === 16) {
            const len = (2 + 16) * 3;
            theme = parseTheme(new Uint8Array(buffer, offset, len));
            offset += len;
          } else if (themeFormat !== 0) {
            logger.warn(`unsupported theme format (${themeFormat})`);
            socket.close();
            return;
          }

          const initLen = view.getUint32(offset, true);
          offset += 4;

          let init;

          if (initLen > 0) {
            init = outputDecoder.decode(new Uint8Array(buffer, offset, initLen));
            offset += initLen;
          }

          handleResetMessage(cols, rows, time, init, theme);
        } else {
          throw "reset expected";
        }
      }
    };
  }

  function getJsonHandler() {
    let firstMessage = true;

    return function(event) {
      if (!firstMessage) {
        buf.pushEvent(JSON.parse(event.data));
      } else {
        firstMessage = false;
        const header = JSON.parse(event.data);
        handleResetMessage(header.width, header.height, 0.0);
      }
    }
  }

  function getRawHandler() {
    const outputDecoder = new TextDecoder();
    let firstMessage = true;

    return function(event) {
      const text = outputDecoder.decode(event.data, { stream: true });

      if (firstMessage) {
        firstMessage = false;
        const [cols, rows] = sizeFromResizeSeq(text) ?? sizeFromScriptStartMessage(text) ?? [80, 24];
        handleResetMessage(cols, rows, 0.0);
      }

      buf.pushText(text);
    };
  }

  return {
    play: () => {
      connect();
    },

    stop: () => {
      stop = true;
      if (buf !== undefined) buf.stop();
      if (socket !== undefined) socket.close();
    },

    getCurrentTime: () => clock.getTime(),
  };
}

function parseTheme(arr) {
  const colorCount = arr.length / 3;
  const foreground = hexColor(arr[0], arr[1], arr[2]);
  const background = hexColor(arr[3], arr[4], arr[5]);
  const palette = [];

  for (let i = 2; i < colorCount; i++) {
    palette.push(hexColor(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]));
  }

  return { foreground, background, palette };
}

function hexColor(r, g, b) {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
}

function byteToHex(value) {
  return value.toString(16).padStart(2, "0");
}

function sizeFromResizeSeq(text) {
  const match = text.match(/\x1b\[8;(\d+);(\d+)t/);

  if (match !== null) {
    return [parseInt(match[2], 10), parseInt(match[1], 10)];
  }
}

function sizeFromScriptStartMessage(text) {
  const match = text.match(/\[.*COLUMNS="(\d{1,3})" LINES="(\d{1,3})".*\]/);

  if (match !== null) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }
}

export default websocket;
