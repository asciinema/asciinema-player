import getBuffer from '../buffer';
import { Clock, NullClock } from '../clock';
import { PrefixedLogger } from '../logging';

function exponentialDelay(attempt) {
  return Math.min(500 * Math.pow(2, attempt), 5000);
}

function websocket({ url, bufferTime, reconnectDelay = exponentialDelay, minFrameTime }, { feed, reset, setState, logger }) {
  logger = new PrefixedLogger(logger, 'websocket: ');
  const utfDecoder = new TextDecoder();
  let socket;
  let buf;
  let clock = new NullClock();
  let reconnectAttempt = 0;
  let successfulConnectionTimeout;
  let stop = false;

  function initBuffer(baseStreamTime) {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(bufferTime, feed, (t) => clock.setTime(t), baseStreamTime, minFrameTime, logger);
  }

  function detectProtocol(event) {
    if (typeof event.data === 'string') {
      logger.info('activating asciicast-compatible handler');
      initBuffer();
      socket.onmessage = handleJsonMessage;
      handleJsonMessage(event);
    } else {
      const arr = new Uint8Array(event.data);

      if (arr[0] == 0x41 && arr[1] == 0x4c && arr[2] == 0x69 && arr[3] == 0x53) { // 'ALiS'
        if (arr[4] == 1) {
          logger.info('activating ALiS v1 handler');
          socket.onmessage = handleStreamMessage;
        } else {
          logger.warn(`unsupported ALiS version (${arr[4]})`);
          socket.close();
        }
      } else {
        logger.info('activating raw text handler');
        initBuffer();
        const text = utfDecoder.decode(arr);
        const size = sizeFromResizeSeq(text) ?? sizeFromScriptStartMessage(text);

        if (size !== undefined) {
          const [cols, rows] = size;
          handleResetMessage(cols, rows, 0, undefined);
        }

        socket.onmessage = handleRawTextMessage;
        handleRawTextMessage(event);
      }
    }
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

  function handleJsonMessage(event) {
    const e = JSON.parse(event.data);

    if (Array.isArray(e)) {
      buf.pushEvent(e);
    } else if (e.cols !== undefined || e.width !== undefined) {
      handleResetMessage(e.cols ?? e.width, e.rows ?? e.height, e.time, e.init ?? undefined);
    } else if (e.status === 'offline') {
      handleOfflineMessage();
    }
  }

  const THEME_LEN = 54;  // (2 + 16) * 3

  function handleStreamMessage(event) {
    const buffer = event.data;
    const view = new DataView(buffer);
    const type = view.getUint8(0);
    let offset = 1;

    if (type === 0x01) { // reset
      const cols = view.getUint16(offset, true);
      offset += 2;
      const rows = view.getUint16(offset, true);
      offset += 2;
      const time = view.getFloat32(offset, true);
      offset += 4;
      const themeFormat = view.getUint8(offset);
      offset += 1;
      let theme;

      if (themeFormat === 1) {
        theme = parseTheme(new Uint8Array(buffer, offset, THEME_LEN));
        offset += THEME_LEN;
      }

      const initLen = view.getUint32(offset, true);
      offset += 4;

      let init;

      if (initLen > 0) {
        init = utfDecoder.decode(new Uint8Array(buffer, offset, initLen));
        offset += initLen;
      }

      handleResetMessage(cols, rows, time, init, theme);
    } else if (type === 0x6f) { // 'o' - output
      const time = view.getFloat32(1, true);
      const len = view.getUint32(5, true);
      const text = utfDecoder.decode(new Uint8Array(buffer, 9, len));
      buf.pushEvent([time, 'o', text]);
    } else if (type === 0x72) { // 'r' - resize
      const time = view.getFloat32(1, true);
      const cols = view.getUint16(5, true);
      const rows = view.getUint16(7, true);
      buf.pushEvent([time, 'r', `${cols}x${rows}`]);
    } else if (type === 0x04) { // offline (EOT)
      handleOfflineMessage();
    } else {
      logger.debug(`unknown frame type: ${type}`);
    }
  }

  function parseTheme(arr) {
    const foreground = hexColor(arr[0], arr[1], arr[2]);
    const background = hexColor(arr[3], arr[4], arr[5]);
    const palette = [];

    for (let i = 0; i < 16; i++) {
      palette.push(hexColor(arr[i * 3 + 6], arr[i * 3 + 7], arr[i * 3 + 8]));
    }

    return { foreground, background, palette };
  }

  function hexColor(r, g, b) {
    return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
  }

  function byteToHex(value) {
    return value.toString(16).padStart(2, '0');
  }

  function handleRawTextMessage(event) {
    buf.pushText(utfDecoder.decode(event.data));
  }

  function handleResetMessage(cols, rows, time, init, theme) {
    logger.debug(`stream reset (${cols}x${rows} @${time})`);
    setState('playing');
    initBuffer(time);
    reset(cols, rows, init, theme);
    clock = new Clock();

    if (typeof time === 'number') {
      clock.setTime(time);
    }
  }

  function handleOfflineMessage() {
    logger.info('stream offline');
    setState('offline');
    clock = new NullClock();
  }

  function connect() {
    socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      logger.info('opened');
      successfulConnectionTimeout = setTimeout(() => { reconnectAttempt = 0; }, 1000);
    }

    socket.onmessage = detectProtocol;

    socket.onclose = event => {
      if (stop || event.code === 1000 || event.code === 1005) {
        logger.info('closed');
        setState('stopped', { reason: 'ended', message: 'Stream ended' });
      } else {
        clearTimeout(successfulConnectionTimeout);
        const delay = reconnectDelay(reconnectAttempt++);
        logger.info(`unclean close, reconnecting in ${delay}...`);
        setState('loading');
        setTimeout(connect, delay);
      }
    }
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

    getCurrentTime: () => clock.getTime()
  }
}

export default websocket;
