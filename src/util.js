function parseNpt(time) {
  if (typeof time === "number") {
    return time;
  } else if (typeof time === "string") {
    return time
      .split(":")
      .reverse()
      .map(parseFloat)
      .reduce((sum, n, i) => sum + n * Math.pow(60, i));
  } else {
    return undefined;
  }
}

function throttle(f, interval) {
  let enableCall = true;

  return function (...args) {
    if (!enableCall) return;

    enableCall = false;
    f.apply(this, args);
    setTimeout(() => (enableCall = true), interval);
  };
}

export { parseNpt, throttle };
