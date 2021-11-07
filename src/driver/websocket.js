function websocket(url, { feed }) {
  let socket;

  return {
    start: () => {
      socket = new WebSocket(url);

      socket.onmessage = (event) => {
        let data = JSON.parse(event.data);

        if (data[1] == 'o') {
          feed(data[2]);
        }
      }
    },

    stop: () => {
      socket.close();
    }
  }
}

export { websocket };
