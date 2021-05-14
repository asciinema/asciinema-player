class TestDriver {
  // public

  constructor(mode, feed, opts) {
    this.feed = feed;
    this.width = opts.width || 80;
    this.height = opts.height || 24;
    this.nextFrame = this.nextFrame.bind(this);
  }

  load() {
    return new Promise((resolve, reject) => {
      // simulate 2s loading time
      setTimeout(() => {
        resolve({width: this.width, height: this.height});
      }, 2000);
    });
  }

  start() {
    this.nextFrame();
  }

  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  // private

  nextFrame() {
    this.feed(Math.random().toString());
    this.timeoutId = setTimeout(this.nextFrame, 33);
  }
}

export default TestDriver;
