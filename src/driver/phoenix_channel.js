import {Socket} from "phoenix";


function phoenixChannel(socketUrl, channelName, width, height, feed) {
  let socket = new Socket(socketUrl);
  let channel;
  let params = {c: 0};

  return {
    start: () => {
      let resolveLoaded;
      let loader = new Promise(resolve => resolveLoaded = resolve);

      socket.connect();
      channel = socket.channel(channelName, params);

      channel.on("update", data => {
        params.c = params.c + 1;
        feed(data.t);
      });

      channel.join()
      .receive("ok", data => {
        resolveLoaded({
          width: width || data.width,
          height: height || data.height
        });

        setTimeout(() => {
          data.ts.forEach(t => {
            params.c = params.c + 1;
            feed(t)
          });
        }, 0);
      })
      .receive("error", resp => {
        console.log('Unable to join', resp);
      });

      return loader;
    },

    stop: () => {
      if (channel) {
        channel.off("update");
        channel.leave();
      }

      socket.disconnect();
    }
  }
}

export { phoenixChannel };
