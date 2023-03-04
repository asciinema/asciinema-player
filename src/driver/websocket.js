import getBuffer from '../buffer';
import Clock from '../clock';

function exponentialDelay(attempt) {
  return Math.min(500 * Math.pow(2, attempt), 5000);
}

function websocket({ url, bufferTime = 0, reconnectDelay = exponentialDelay }, { feed, reset, setWaiting, onFinish, logger }) {
  const utfDecoder = new TextDecoder();
  let socket;
  let buf;
  let clock;
  let reconnectAttempt = 0;
  let stop = false;

  function initBuffer() {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(feed, bufferTime);
  }

  function connect() {
    socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      logger.info('websocket: opened');
      setWaiting(false);
      initBuffer();
      clock = new Clock();
      reconnectAttempt = 0;
    }

    socket.onmessage = event => {
      if (typeof event.data === 'string') {
        const e = JSON.parse(event.data);

        if (e.cols !== undefined || e.width !== undefined) {
          const cols = e.cols ?? e.width;
          const rows = e.rows ?? e.height;
          logger.debug(`websocket: vt reset (${cols}x${rows})`);
          initBuffer();
          reset(cols, rows);
          clock = new Clock();
        } else {
          buf.pushEvent(e);
          clock.setTime(e[0]);
        }
      } else {
        buf.pushText(utfDecoder.decode(event.data));
      }
    }

    socket.onclose = event => {
      if (stop || event.code === 1000 || event.code === 1005) {
        logger.info('websocket: closed');
        onFinish();
      } else {
        const delay = reconnectDelay(reconnectAttempt++);
        logger.info(`websocket: unclean close, reconnecting in ${delay}...`);
        setWaiting(true);
        setTimeout(connect, delay);
      }
    }
  }

  return {
    start: () => {
      connect();
    },

    stop: () => {
      stop = true;
      if (buf !== undefined) buf.stop();
      if (socket !== undefined) socket.close();
    },

    getCurrentTime: () => {
      if (clock === undefined) {
        return 0;
      } else {
        return clock.getTime();
      }
    }
  }
}

export { websocket };
