function random(_src, { dispatch }, { speed }) {
  const base = " ".charCodeAt(0);
  const range = "~".charCodeAt(0) - base;
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
      dispatch("playing");
      schedule();
    },

    stop() {
      clearInterval(timeoutId);
    },
  };
}

export default random;
