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
  [String.fromCharCode(127)]: "Back",
  "^?": "Back",
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

const unicodeSeqs = {
  "[3~": "Supr",
  "[C": arrowKeys.right,
  OC: arrowKeys.right,
  "[1;3C": `A-${arrowKeys.right}`,
  "[D": arrowKeys.left,
  OD: arrowKeys.left,
  "[1;3D": `A-${arrowKeys.left}`,
  "[A": arrowKeys.up,
  OA: arrowKeys.up,
  "[1;3A": `A-${arrowKeys.up}`,
  "[B": arrowKeys.down,
  OB: arrowKeys.down,
  "[1;3B": `A-${arrowKeys.down}`,
  "[H": "Home",
  "[5~": "PgUp",
  "[57421u": "PgUp",
  "[57421;1:3u": "PgUp",
  "[57362u": "Pause",
  "[57362;1:3u": "Pause",
  "[6~": "PgDn",
  "[57422u": "PgDn",
  "[57422;1:3u": "PgDn",
  OP: "F1",
  "[P": "F1",
  "[1;1:3P": "F1",
  OQ: "F2",
  "[Q": "F2",
  "[1;1:3Q": "F2",
  OR: "F3",
  "[R": "F3",
  "[1;1:3R": "F3",
  OS: "F4",
  "[S": "F4",
  "[1;1:3S": "F4",
  "[15~": "F5",
  "[15;1:3~": "F5",
  "[17~": "F6",
  "[17;1:3~": "F6",
  "[18~": "F7",
  "[18;1:3~": "F7",
  "[19~": "F8",
  "[19;1:3~": "F8",
  "[20~": "F9",
  "[20;1:3~": "F9",
  "[21~": "F10",
  "[21;1:3~": "F10",
  "[23~": "F11",
  "[23;1:3~": "F11",
  "[24~": "F12",
  "[24;1:3~": "F12",
  "[97;;97u": "A-a",
  "[98;;98u": "A-b",
  "[99;;99u": "A-c",
  "[100;;100u": "A-d",
  "[101;;101u": "A-e",
  "[102;;102u": "A-f",
  "[103;;103u": "A-g",
  "[104;;104u": "A-h",
  "[105;;105u": "A-i",
  "[106;;106u": "A-j",
  "[107;;107u": "A-k",
  "[108;;108u": "A-l",
  "[109;;109u": "A-m",
  "[110;;110u": "A-n",
  "[111;;111u": "A-o",
  "[112;;112u": "A-p",
  "[113;;113u": "A-q",
  "[114;;114u": "A-r",
  "[115;;115u": "A-s",
  "[116;;116u": "A-t",
  "[117;;117u": "A-u",
  "[118;;118u": "A-v",
  "[119;;119u": "A-w",
  "[120;;120u": "A-x",
  "[121;;121u": "A-y",
  "[122;;122u": "A-z",
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
  3: "Supr",
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

  const csiU = seq.match(/^(\d+)(?:;([\d:]+))?u$/);

  if (csiU !== null) {
    const key = codepointToKey(Number.parseInt(csiU[1], 10));
    return csiU[2] === undefined ? key : addModifierPrefix(key, csiU[2]);
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
