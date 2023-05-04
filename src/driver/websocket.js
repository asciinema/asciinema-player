import getBuffer from '../buffer';
import Clock from '../clock';

function exponentialDelay(attempt) {
  return Math.min(500 * Math.pow(2, attempt), 5000);
}

function websocket({ url, bufferTime = 0.1, reconnectDelay = exponentialDelay }, { feed, reset, setState, logger }) {
  const utfDecoder = new TextDecoder();
  let socket;
  let buf;
  let clock;
  let reconnectAttempt = 0;
  let successfulConnectionTimeout;
  let stop = false;

  function setTime(time) {
    if (clock !== undefined) {
      clock.setTime(time);
    }
  }

  function initBuffer(baseStreamTime) {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(feed, setTime, bufferTime, baseStreamTime);
  }

  function connect() {
    socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      logger.info('websocket: opened');
      initBuffer();
      successfulConnectionTimeout = setTimeout(() => { reconnectAttempt = 0; }, 1000);
    }

    socket.onmessage = event => {
      if (typeof event.data === 'string') {
        const e = JSON.parse(event.data);

        if (Array.isArray(e)) {
          buf.pushEvent(e);
        } else if (e.cols !== undefined || e.width !== undefined) {
          const cols = e.cols ?? e.width;
          const rows = e.rows ?? e.height;
          logger.debug(`websocket: vt reset (${cols}x${rows})`);
          setState('playing');
          initBuffer(e.time);
          reset(cols, rows, e.init ?? undefined);
          clock = new Clock();

          if (typeof e.time === 'number') {
            clock.setTime(e.time);
          }
        } else if (e.state === 'offline') {
          logger.info('websocket: stream offline');
          setState('offline');
          clock = undefined;
        }
      } else {
        buf.pushText(utfDecoder.decode(event.data));
      }
    }

    socket.onclose = event => {
      if (stop || event.code === 1000 || event.code === 1005) {
        logger.info('websocket: closed');
        setState('stopped', { reason: 'ended' });
      } else {
        clearTimeout(successfulConnectionTimeout);
        const delay = reconnectDelay(reconnectAttempt++);
        logger.info(`websocket: unclean close, reconnecting in ${delay}...`);
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

    getCurrentTime: () => {
      if (clock === undefined) {
        return undefined;
      } else {
        return clock.getTime();
      }
    }
  }
}

export { websocket };
