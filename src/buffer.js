import Queue from "./queue";

function buffer(feed, bufferTime) {
  const events = new Queue();
  let startTime;

  events.forEach(async event => {
    const elapsedWallTime = now() - startTime;
    const elapsedStreamTime = (event[0] + bufferTime) * 1000;

    if (elapsedStreamTime > elapsedWallTime) {
      await sleep(elapsedStreamTime - elapsedWallTime);
    }

    feed(event[2]);
  });

  return {
    pushEvent(event) {
      if (startTime === undefined) {
        startTime = now();
      }

      if (event[1] != 'o') return;

      events.push(event);
    },

    pushText(text) {
      if (startTime === undefined) {
        startTime = now();
      }

      const time = (now() - startTime) / 1000;
      events.push([time, 'o', text]);
    }
  }
}

function now() {
  return (new Date()).getTime();
}

function sleep(t) {
  return new Promise(resolve => {
    setTimeout(resolve, t);
  });
}

export default buffer;
