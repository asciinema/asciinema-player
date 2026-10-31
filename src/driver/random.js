import { Clock } from "../clock";

function random(_src, { dispatch }, { speed }) {
  const base = " ".charCodeAt(0);
  const range = "~".charCodeAt(0) - base;
  const clock = new Clock((timing) => dispatch("timing", timing));
  let timeoutId;

  const schedule = () => {
    const t = Math.pow(5, Math.random() * 4);
    timeoutId = setTimeout(print, t / speed);
  };

  const print = () => {
    schedule();
    const char = String.fromCharCode(base + Math.floor(Math.random() * range));
    dispatch("output", char);
  };

  return {
    play() {
      if (timeoutId !== undefined) return true;

      dispatch("play");
      clock.setTime(0, speed);
      dispatch("playing");
      schedule();
    },

    stop() {
      clearTimeout(timeoutId);
      timeoutId = undefined;
      clock.stop();
    },

    getTiming: () => clock.getTiming(),
  };
}

export default random;
