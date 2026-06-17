import { createEffect, createSignal, onCleanup, Show } from "solid-js";

const FADE_DELAY_MS = 1200;

const controlSeqs = Object.fromEntries(
  Array.from({ length: 26 }, (_, i) => {
    const char = String.fromCharCode(i + 1);
    const key = String.fromCharCode(97 + i);

    return [char, `C-${key}`];
  }),
);

const basic_seqs = {
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

const unicode_seq = {
  "[3~": "Supr",
  "[C": "Right",
  OC: "Right",
  "[1;3C": "A-Right",
  "[D": "Left",
  OD: "Left",
  "[1;3D": "A-Left",
  "[A": "Up",
  OA: "Up",
  "[1;3A": "A-Up",
  "[B": "Down",
  OB: "Down",
  "[1;3B": "A-Down",
  "[H": "Home",
  "[5~": "PgUp",
  "[57421u": "PgUp",
  "[57421;1:3u": "PgUp",
  "[57362u": "PgUp",
  "[57362;1:3u": "PgUp",
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
  A: "Up",
  B: "Down",
  C: "Right",
  D: "Left",
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
  const char = String.fromCodePoint(codepoint);

  if (char in basic_seqs) {
    return basic_seqs[char];
  }

  if (char in singles) {
    return singles[char];
  }

  return char;
}

function formatCsiSequence(seq) {
  if (seq in unicode_seq) {
    return unicode_seq[seq];
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
    if (seq in basic_seqs) {
      return "A-" + basic_seqs[seq];
    }

    return seq in singles ? "A-" + singles[seq] : "A-" + seq;
  }

  if (seq in unicode_seq) {
    return unicode_seq[seq];
  }

  if (seq.startsWith("[")) {
    return formatCsiSequence(seq.slice(1));
  }

  return "";
}

function formatKeyCode(data, logger) {
  if (data in basic_seqs) {
    return basic_seqs[data];
  }

  if (data.length === 1) {
    if (data in singles) {
      return singles[data];
    }
    return data;
  }

  if (data.startsWith("\u001b")) {
    const key = formatEscapeSequence(data);

    if (key !== "") {
      return key;
    }
  }

  const rep = JSON.stringify(data).slice(1, -1);
  if (rep.length < 10) logger.info("<" + rep + ">", rep.length);

  return "";
}

export default (props) => {
  const [isFading, setIsFading] = createSignal(false);
  const keyLabel =
    props.keystroke === null ? "" : formatKeyCode(props.keystroke.value, props.logger);

  createEffect(() => {
    if (keyLabel === "") {
      return;
    }

    setIsFading(false);

    const timeoutId = setTimeout(function () {
      setIsFading(true);
    }, FADE_DELAY_MS);

    onCleanup(() => clearTimeout(timeoutId));
  });

  return (
    <Show when={keyLabel !== ""}>
      <div
        class={
          isFading()
            ? "ap-overlay ap-overlay-keystrokes fading"
            : "ap-overlay ap-overlay-keystrokes"
        }
        style={{ "--ap-keystrokes-bottom": `${(props.bottomOffset ?? 0) + 12}px` }}
      >
        <div>
          <kbd>{keyLabel}</kbd>
        </div>
      </div>
    </Show>
  );
};
