function random(src, { feed, setTimeout }) {
  const base = ' '.charCodeAt(0);
  const range = '~'.charCodeAt(0) - base;
  let timeoutId;

  const schedule = () => {
    const t = Math.pow(5, Math.random() * 4);
    timeoutId = setTimeout(print, t);
  }

  const print = () => {
    schedule();
    const char = String.fromCharCode(base + Math.floor(Math.random() * range));
    feed(char);
  };

  return () => {
    schedule();

    return () => clearInterval(timeoutId);
  }
}

export default random;
