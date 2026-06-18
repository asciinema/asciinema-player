import { test, expect } from "@playwright/test";
import { formatKeyCode } from "../../src/keystrokes.js";

const cases = [
  ["plain character", "a", "a"],
  ["space", " ", "Spc"],
  ["return", "\r", "Ret"],
  ["control character", "\u0010", "C-p"],
  ["CSI-u control key", "\u001b[112;5u", "C-p"],
  ["modified arrow key", "\u001b[1;5C", "C-Right"],
  ["backspace", "\u007f", "Back"],
  ["alt-backspace", "\u001b\u007f", "A-Back"],
  ["unsupported sequence", "\u001b[999~", ""],
];

for (const [name, input, label] of cases) {
  test(`formats ${name}`, () => {
    expect(formatKeyCode(input)).toBe(label);
  });
}
