import {Socket} from "phoenix";


class PhoenixChannelDriver {
  // public

  constructor(feed, opts) {
    this.feed = feed;
    this.width = opts.width;
    this.height = opts.height;
  }

  load() {
    this.socket = new Socket("ws://localhost:4000/socket");
    this.socket.connect();

    return Promise.resolve({width: this.width, height: this.height});
  }

  start() {
    let params = {c: 0};

    this.channel = this.socket.channel('stream:test', params);

    this.channel.on("update", data => {
      params.c = params.c + 1;
      this.feed(data.t);
    });

    this.channel.join()
    .receive("ok", resp => {
      console.log('joined successfully');
    })
    .receive("error", resp => {
      console.log('Unable to join', resp);
    });
  }

  stop() {
    this.channel.off("update");
    this.channel.leave();
  }
}

export default PhoenixChannelDriver;
