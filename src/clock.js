class Clock {
  constructor(speed = 1.0) {
    this.speed = speed;
    this.startTime = performance.now();
  }

  getTime() {
    return this.speed * (performance.now() - this.startTime) / 1000.0;
  }

  setTime(time) {
    this.startTime = performance.now() - (time / this.speed) * 1000.0;
  }
}

export default Clock;
