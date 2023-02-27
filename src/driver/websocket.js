import getBuffer from '../buffer';

function exponentialDelay(attempt) {
  return Math.min(500 * Math.pow(2, attempt), 5000);
}

function websocket({ url, bufferTime = 0, reconnectDelay = exponentialDelay }, { feed, reset, setWaiting, onFinish }) {
  const utfDecoder = new TextDecoder();
  let socket;
  let buf;
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
      console.debug('websocket: opened');
      setWaiting(false);
      initBuffer();
      reconnectAttempt = 0;
    }

    socket.onmessage = event => {
      if (typeof event.data === 'string') {
        const e = JSON.parse(event.data);

        if (e.cols !== undefined || e.width !== undefined) {
          initBuffer();
          reset(e.cols ?? e.width, e.rows ?? e.height);
        } else {
          buf.pushEvent(e);
        }
      } else {
        buf.pushText(utfDecoder.decode(event.data));
      }
    }

    socket.onclose = event => {
      if (stop || event.code === 1000 || event.code === 1005) {
        console.debug('websocket: closed');
        onFinish();
      } else {
        const delay = reconnectDelay(reconnectAttempt++);
        console.debug(`websocket: unclean close, reconnecting in ${delay}...`);
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
    }
  }
}

export { websocket };
