import getBuffer from '../buffer';
import { Clock, NullClock } from '../clock';
import { PrefixedLogger } from '../logging';
import LzwDecompressor from '../lzw';

function exponentialDelay(attempt) {
  return Math.min(500 * Math.pow(2, attempt), 5000);
}

function websocket({ url, bufferTime = 0.1, reconnectDelay = exponentialDelay, minFrameTime }, { feed, reset, setState, logger }) {
  logger = new PrefixedLogger(logger, 'websocket: ');
  const utfDecoder = new TextDecoder();
  let socket;
  let buf;
  let clock = new NullClock();
  let reconnectAttempt = 0;
  let successfulConnectionTimeout;
  let stop = false;
  let lzwDecompressor;

  function initBuffer(baseStreamTime) {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(feed, (t) => clock.setTime(t), bufferTime, baseStreamTime, minFrameTime);
  }

  function detectProtocol(event) {
    if (typeof event.data === 'string') {
      logger.info('activating asciicast-compatible handler');
      socket.onmessage = handleJsonMessage;
      handleJsonMessage(event);
    } else {
      const arr = new Uint8Array(event.data);

      if (arr[0] == 0x41 && arr[1] == 0x4c && arr[2] == 0x69 && arr[3] == 0x53) { // 'ALiS'
        if (arr[4] == 1) {
          logger.info('activating ALiS v1 handler');
          lzwDecompressor = new LzwDecompressor();
          socket.onmessage = handleStreamMessage;
        } else {
          logger.warn(`unsupported ALiS version (${arr[4]})`);
          socket.close();
        }
      } else {
        logger.info('activating raw text handler');
        const text = utfDecoder.decode(arr.subarray(0, 12));
        const sizeMatch = text.match(/\x1b\[8;(\d+);(\d+)t/);

        if (sizeMatch !== null) {
          const cols = parseInt(sizeMatch[2], 10);
          const rows = parseInt(sizeMatch[1], 10);
          handleResetMessage(cols, rows, 0, undefined);
        }

        socket.onmessage = handleRawTextMessage;
        handleRawTextMessage(event);
      }
    }
  }

  function handleJsonMessage(event) {
    const e = JSON.parse(event.data);

    if (Array.isArray(e)) {
      buf.pushEvent(e);
    } else if (e.cols !== undefined || e.width !== undefined) {
      handleResetMessage(e.cols ?? e.width, e.rows ?? e.height, e.time, e.init ?? undefined);
    } else if (e.state === 'offline') {
      handleOfflineMessage();
    }
  }

  function handleStreamMessage(event) {
    const buffer = event.data;
    const array = new Uint8Array(buffer);
    const type = array[0];

    if (type === 0x01) { // reset
      const view = new DataView(buffer);
      const cols = view.getUint16(1, true);
      const rows = view.getUint16(3, true);
      const time = view.getFloat32(5, true);
      const len = view.getUint32(9, true);

      const init = len > 0
        ? utfDecoder.decode(lzwDecompressor.decompress(new DataView(buffer, 13, len)))
        : undefined;

      handleResetMessage(cols, rows, time, init);
    } else if (type === 0x6f) { // 'o' - output
      const view = new DataView(buffer);
      const time = view.getFloat32(1, true);
      const len = view.getUint32(5, true);
      const text = utfDecoder.decode(lzwDecompressor.decompress(new DataView(buffer, 9, len)));
      buf.pushEvent([time, 'o', text]);
    } else if (type === 0x04) { // offline (EOT)
      handleOfflineMessage();
    } else {
      logger.debug(`unknown frame type: ${type}`);
    }
  }

  function handleRawTextMessage(event) {
    buf.pushText(utfDecoder.decode(event.data));
  }

  function handleResetMessage(cols, rows, time, init) {
    logger.debug(`vt reset (${cols}x${rows} @${time})`);
    setState('playing');
    initBuffer(time);
    reset(cols, rows, init);
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
      initBuffer();
      successfulConnectionTimeout = setTimeout(() => { reconnectAttempt = 0; }, 1000);
    }

    socket.onmessage = detectProtocol;

    socket.onclose = event => {
      if (stop || event.code === 1000 || event.code === 1005) {
        logger.info('closed');
        setState('stopped', { reason: 'ended' });
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
