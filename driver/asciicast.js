// TODO rename to FileDriver
// TODO support ttyrec (via opts.type == 'ttyrec')

class AsciicastDriver {
  // public

  constructor(url, feed, opts) {
    this.url = url;
    this.feed = feed;
    this.loop = opts && !!opts.loop;
    this.runFrame = this.runFrame.bind(this);
  }

  load() {
    return fetch(this.url)
    .then(res => res.json())
    .then(asciicast => {
      this.width = asciicast['width'];
      this.height = asciicast['height'];
      this.frames = asciicast['stdout'];

      return {
        width: this.width,
        height: this.height
      };
    })
  }

  start() {
    this.nextFrameIndex = 0;
    this.virtualElapsedTime = 0;
    this.startedTime = (new Date()).getTime();
    this.lastFrameTime = this.startedTime;
    this.scheduleNextFrame();
  }

  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  // private

  scheduleNextFrame() {
    const nextFrame = this.frames[this.nextFrameIndex];

    if (nextFrame) {
      const delay = nextFrame[0] * 1000;
      const actualElapsedTime = (new Date()).getTime() - this.startedTime;
      let timeout = (this.virtualElapsedTime + delay) - actualElapsedTime;

      if (timeout < 0) {
        timeout = 0;
      }

      this.timeoutId = setTimeout(this.runFrame, timeout);
    } else {
      console.log('finished');

      if (this.loop) {
        this.start();
      }
    }
  }

  runFrame() {
    let frame = this.frames[this.nextFrameIndex];
    let actualElapsedTime;

    do {
      this.feed(frame[1]);
      this.virtualElapsedTime += (frame[0] * 1000);
      this.nextFrameIndex++;
      frame = this.frames[this.nextFrameIndex];
      actualElapsedTime = (new Date()).getTime() - this.startedTime;
    } while (frame && (actualElapsedTime > (this.virtualElapsedTime + frame[0] * 1000)));

    this.scheduleNextFrame();
  }
}

export default AsciicastDriver;
