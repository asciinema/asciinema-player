import { test, expect } from "@playwright/test";
import { formatKeyCode } from "../../src/keystrokes.js";

const cases = [
  ["plain character", "a", "a"],
  ["space", " ", "Spc"],
  ["return", "\r", "Ret"],
  ["control character", "\u0010", "C-p"],
  ["CSI-u control key", "\u001b[112;5u", "C-p"],
  ["up arrow key", "\u001b[A", "↑"],
  ["down arrow key", "\u001b[B", "↓"],
  ["right arrow key", "\u001b[C", "→"],
  ["left arrow key", "\u001b[D", "←"],
  ["modified arrow key", "\u001b[1;5C", "C-→"],
  ["multi-modifier arrow key", "\u001b[1;6C", "C-S-→"],
  ["application-mode home", "\u001bOH", "Home"],
  ["end", "\u001b[F", "End"],
  ["application-mode end", "\u001bOF", "End"],
  ["application-mode function key", "\u001bOP", "F1"],
  ["insert", "\u001b[2~", "Ins"],
  ["delete", "\u001b[3~", "Del"],
  ["modified delete", "\u001b[3;129~", "Del"],
  ["modifyOtherKeys control key", "\u001b[27;5;112~", "C-p"],
  ["CSI-u alt letter", "\u001b[97;;97u", "A-a"],
  ["scroll lock", "\u001b[57359;129u", "Scroll"],
  ["pause", "\u001b[57362;129u", "Pause"],
  ["keypad enter", "\u001b[57414;129u", "Enter"],
  ["backspace", "\u007f", "Back"],
  ["alt-backspace", "\u001b\u007f", "A-Back"],
  ["unsupported sequence", "\u001b[999~", ""],
];

for (const [name, input, label] of cases) {
  test(`formats ${name}`, () => {
    expect(formatKeyCode(input)).toBe(label);
  });
}
