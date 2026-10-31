import { createTiming, getTime } from "./timing";

class Clock {
  constructor(onChange) {
    this.onChange = onChange;
    this.timing = createTiming(null, 0);
  }

  getTiming() {
    return createTiming(getTime(this.timing), this.timing.rate);
  }

  setTime(time, rate = this.timing.rate) {
    this.timing = createTiming(time, rate);
    this.onChange(this.timing);
  }

  stop() {
    this.setTime(getTime(this.timing), 0);
  }
}

export { Clock };
