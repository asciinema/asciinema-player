import buffer from '../buffer';

function websocket({ url, bufferTime = 0 }, { feed, reset, setWaiting, onFinish }) {
  const utfDecoder = new TextDecoder();
  let socket;
  let buf;
  let reconnectDelay = 250;
  let stop = false;

  function initBuffer() {
    if (buf !== undefined) buf.stop();
    buf = buffer(feed, bufferTime);
  }

  function connect() {
    socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      console.debug('websocket: opened');
      setWaiting(false);
      initBuffer();
      reconnectDelay = 250;
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
        console.debug(`websocket: unclean close, reconnecting in ${reconnectDelay}...`);
        setWaiting(true);
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 5000);
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
