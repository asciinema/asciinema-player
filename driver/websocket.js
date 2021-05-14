class WebsocketDriver {
  // public

  constructor(feed, opts) {
    this.feed = feed;
    this.width = opts.width;
    this.height = opts.height;
  }

  load() {
    this.socket = new WebSocket('ws://localhost:1234');

    return Promise.resolve({width: this.width, height: this.height});
  }

  start() {
    let thiz = this;

    this.socket.onmessage = function(event) {
      let data = JSON.parse(event.data);

      if (data[1] == 'o') {
        thiz.feed(data[2]);
      }
    }
  }

  stop() {
    this.socket.close();
  }
}

export default WebsocketDriver;
