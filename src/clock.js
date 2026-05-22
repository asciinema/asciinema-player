class Clock {
  constructor(speed = 1.0) {
    this.speed = speed;
    this.startTime = performance.now();
  }

  getTime() {
    return this.speed * (performance.now() - this.startTime);
  }

  setTime(time) {
    this.startTime = performance.now() - time / this.speed;
  }
}

class NullClock {
  constructor() {}
  getTime(_speed) {}
  setTime(_time) {}
}

export { Clock, NullClock };
