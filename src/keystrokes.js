const controlSeqs = Object.fromEntries(
  Array.from({ length: 26 }, (_, i) => {
    const char = String.fromCharCode(i + 1);
    const key = String.fromCharCode(97 + i);

    return [char, `C-${key}`];
  }),
);

const basicSeqs = {
  ...controlSeqs,
  "\b": "Back",
  "\r": "Ret",
  "\t": "Tab",
  "\u001b": "Esc",
  "\u007f": "Back",
};

const singles = {
  " ": "Spc",
};

const functionalKeys = {
  57358: "Caps",
  57359: "Scroll",
  57360: "Num",
  57361: "Print",
  57362: "Pause",
  57363: "Menu",
  57414: "Enter",
};

const arrowKeys = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

// Protocol-specific aliases that do not fit the generic CSI/SS3 parsers below.
const unicodeSeqs = {
  "[57421u": "PgUp",
  "[57421;1:3u": "PgUp",
  "[57362u": "Pause",
  "[57362;1:3u": "Pause",
  "[57422u": "PgDn",
  "[57422;1:3u": "PgDn",
  "[27u": "Esc",
};

const csiFinalKeys = {
  A: arrowKeys.up,
  B: arrowKeys.down,
  C: arrowKeys.right,
  D: arrowKeys.left,
  F: "End",
  H: "Home",
  P: "F1",
  Q: "F2",
  R: "F3",
  S: "F4",
};

const csiTildeKeys = {
  2: "Ins",
  3: "Del",
  5: "PgUp",
  6: "PgDn",
  15: "F5",
  17: "F6",
  18: "F7",
  19: "F8",
  20: "F9",
  21: "F10",
  23: "F11",
  24: "F12",
};

function addModifierPrefix(key, modifier) {
  const mod = Number.parseInt(modifier.split(":")[0], 10);

  if (!Number.isFinite(mod) || mod <= 1) {
    return key;
  }

  const bits = mod - 1;
  const parts = [];

  if (bits & 4) parts.push("C");
  if (bits & 2) parts.push("A");
  if (bits & 1) parts.push("S");

  return parts.length === 0 ? key : `${parts.join("-")}-${key}`;
}

function codepointToKey(codepoint) {
  if (codepoint in functionalKeys) {
    return functionalKeys[codepoint];
  }

  const char = String.fromCodePoint(codepoint);

  if (char in basicSeqs) {
    return basicSeqs[char];
  }

  if (char in singles) {
    return singles[char];
  }

  return char;
}

function formatCsiSequence(seq) {
  if (seq in unicodeSeqs) {
    return unicodeSeqs[seq];
  }

  const csiUAlt = seq.match(/^(\d+);;(\d+)u$/);

  if (csiUAlt !== null) {
    return `A-${codepointToKey(Number.parseInt(csiUAlt[2], 10))}`;
  }

  const csiU = seq.match(/^(\d+)(?:;([\d:]+))?u$/);

  if (csiU !== null) {
    const key = codepointToKey(Number.parseInt(csiU[1], 10));
    return csiU[2] === undefined ? key : addModifierPrefix(key, csiU[2]);
  }

  const finalKey = seq.match(/^O?([A-Z])$/);

  if (finalKey !== null && finalKey[1] in csiFinalKeys) {
    return csiFinalKeys[finalKey[1]];
  }

  const tildeKey = seq.match(/^(\d+)~$/);

  if (tildeKey !== null && tildeKey[1] in csiTildeKeys) {
    return csiTildeKeys[tildeKey[1]];
  }

  const modifyOtherKeys = seq.match(/^27;([\d:]+);(\d+)~$/);

  if (modifyOtherKeys !== null) {
    const key = codepointToKey(Number.parseInt(modifyOtherKeys[2], 10));
    return addModifierPrefix(key, modifyOtherKeys[1]);
  }

  const modifiedFinal = seq.match(/^(?:1;)?([\d:]+)([A-Z])$/);

  if (modifiedFinal !== null && modifiedFinal[2] in csiFinalKeys) {
    return addModifierPrefix(csiFinalKeys[modifiedFinal[2]], modifiedFinal[1]);
  }

  const modifiedTilde = seq.match(/^(\d+);([\d:]+)~$/);

  if (modifiedTilde !== null && modifiedTilde[1] in csiTildeKeys) {
    return addModifierPrefix(csiTildeKeys[modifiedTilde[1]], modifiedTilde[2]);
  }

  return "";
}

function formatEscapeSequence(data) {
  const seq = data.slice(1);

  if (seq.length === 1) {
    if (seq in basicSeqs) {
      return "A-" + basicSeqs[seq];
    }

    return seq in singles ? "A-" + singles[seq] : "A-" + seq;
  }

  if (seq in unicodeSeqs) {
    return unicodeSeqs[seq];
  }

  if (seq.startsWith("[")) {
    return formatCsiSequence(seq.slice(1));
  }

  if (seq.startsWith("O")) {
    return formatCsiSequence(seq);
  }

  return "";
}

export function formatKeystroke(data) {
  if (data in basicSeqs) {
    return { kind: "special", label: basicSeqs[data] };
  }

  if (data.length === 1) {
    if (data in singles) {
      return { kind: "special", label: singles[data] };
    }
    return { kind: "text", label: data };
  }

  if (data.startsWith("\u001b")) {
    const key = formatEscapeSequence(data);

    if (key !== "") {
      return { kind: "special", label: key };
    }
  }

  return null;
}

export function formatKeyCode(data) {
  return formatKeystroke(data)?.label ?? "";
}
