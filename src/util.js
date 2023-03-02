function parseNpt(time) {
  if (typeof time === 'number') {
    return time;
  } else if (typeof time === 'string') {
    return time
      .split(':')
      .reverse()
      .map(parseFloat)
      .reduce((sum, n, i) => sum + n * Math.pow(60, i));
  } else {
    return undefined;
  }
}

function debounce(f, delay) {
  let timeout;

  return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => f.apply(this, args), delay);
  }
}

export { parseNpt, debounce };
