import buffer from '../buffer';

function websocket({ url, bufferTime = 0 }, { feed }) {
  const buf = buffer(feed, bufferTime);
  let socket;

  return {
    start: () => {
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';

      socket.onmessage = event => {
        if (typeof event.data === 'string') {
          buf.pushEvent(JSON.parse(event.data));
        } else {
          buf.pushText(String.fromCharCode.apply(null, new Uint8Array(event.data)));
        }
      }
    },

    stop: () => {
      socket.close();
    }
  }
}

export { websocket };
