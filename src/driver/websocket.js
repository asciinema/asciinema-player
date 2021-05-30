function websocket(url, { feed }, { cols, rows }) {
  let socket;

  return {
    start: () => {
      let resolveLoaded;
      let loader = new Promise(resolve => resolveLoaded = resolve);
      let loaded = false;

      socket = new WebSocket(url);

      socket.onmessage = (event) => {
        let data = JSON.parse(event.data);

        if (data.width) {
          resolveLoaded({
            cols: cols || data.cols || data.width,
            rows: rows || data.rows || data.height
          });

          loaded = true;
        } else if (data[1] == 'o' && loaded) {
          feed(data[2]);
        }
      }

      return loader;
    },

    stop: () => {
      socket.close();
    }
  }
}

export { websocket };
