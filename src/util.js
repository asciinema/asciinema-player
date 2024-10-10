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

function debounce(f, delay) {
  let timeout;

  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => f.apply(this, args), delay);
  };
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

function printablekeypress(key_press, logger) {
  let rep = JSON.stringify(key_press);
  const unicode_seq = {
    '" "': "Spc",
    '"\\r"': "Ret",
    '"\\t"': "Tab",
    '"\\u001b"': "Esc",
    '"\\u001b[3~"': "Supr",
    '"^?"': "back",
    '"\\u000b"': "beep",
    '"\\u001b[C"': "Right",
    '"\\u001bOC"': "Right",
    '"\\u001b[D"': "Left",
    '"\\u001bOD"': "Left",
    '"\\u001b[A"': "Up",
    '"\\u001bOA"': "Up",
    '"\\u001b[B"': "Down",
    '"\\u001bOB"': "Down",
    '"\\u001b[H"': "Home",
    '"\\u001b[5~"': "PgUp",
    '"\\u001b[6~"': "PgDn",
    '"\\u001b[57422u"': "PgDn",
    '"\\u001b[57362u"': "Pgup",
    '"\\u001bOP"': "F1",
    '"\\u001bOQ"': "F2",
    '"\\u001bOR"': "F3",
    '"\\u001bOS"': "F4",
    '"\\u001b[15~"': "F5",
    '"\\u001b[17~"': "F6",
    '"\\u001b[18~"': "F7",
    '"\\u001b[19~"': "F8",
    '"\\u001b[20~"': "F9",
    '"\\u001b[21~"': "F10",
    '"\\u001b[23~"': "F11",
    '"\\u001b[24~"': "F12",
    '"\\u0001"': "C-a",
    '"\\u0002"': "C-b",
    '"\\u0003"': "C-c",
    '"\\u0004"': "C-d",
    '"\\u0005"': "C-e",
    '"\\u0006"': "C-f",
    '"\\u0007"': "C-g",
    '"\\u0008"': "C-h",
    '"\\u0009"': "C-i",
    '"\\u0010"': "C-j",
    '"\\u0011"': "C-k",
    '"\\u0012"': "C-l",
    '"\\u0013"': "C-m",
    '"\\u0014"': "C-n",
    '"\\u0015"': "C-o",
    '"\\u0016"': "C-p",
    '"\\u0017"': "C-q",
    '"\\u0018"': "C-r",
    '"\\u0019"': "C-s",
    '"\\u0020"': "C-t",
    '"\\u0021"': "C-u",
    '"\\u0022"': "C-v",
    '"\\u0023"': "C-w",
    '"\\u0024"': "C-x",
    '"\\u0025"': "C-y",
    '"\\u0026"': "C-z",
    '"\\u001ba"': "A-a",
    '"\\u001bb"': "A-b",
    '"\\u001bc"': "A-c",
    '"\\u001bd"': "A-d",
    '"\\u001be"': "A-e",
    '"\\u001bf"': "A-f",
    '"\\u001bg"': "A-g",
    '"\\u001bh"': "A-h",
    '"\\u001bi"': "A-i",
    '"\\u001bj"': "A-j",
    '"\\u001bk"': "A-k",
    '"\\u001bl"': "A-l",
    '"\\u001bm"': "A-m",
    '"\\u001bn"': "A-n",
    '"\\u001bo"': "A-o",
    '"\\u001bp"': "A-p",
    '"\\u001bq"': "A-q",
    '"\\u001br"': "A-r",
    '"\\u001bs"': "A-s",
    '"\\u001bt"': "A-t",
    '"\\u001bu"': "A-u",
    '"\\u001bv"': "A-v",
    '"\\u001bw"': "A-w",
    '"\\u001bx"': "A-x",
    '"\\u001by"': "A-y",
    '"\\u001bz"': "A-z",
  };
  if (rep in unicode_seq) {
    return unicode_seq[rep];
  } else if (rep.startsWith('"\\')) {
    logger.info("- ", rep, key_press);
    return "";
  }
  return rep.slice(1, -1);
}

export { parseNpt, debounce, throttle, printablekeypress };
