// Generates unicode.cast for the backend examples. Shared by ghostty-web and
// wterm so both play an identical recording. The recording ends with a Kitty
// Graphics Protocol image; terminals without graphics support swallow the escape.
//
//   node gen-cast.mjs               # writes ./ghostty-web/unicode.cast and ./wterm/unicode.cast
//   node gen-cast.mjs <outfile>     # writes a single file
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

function makePng(W = 64, H = 64) {
  const raw = Buffer.alloc(H * (1 + W * 3));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - W / 2, y - H / 2);
      let r, g, b;
      if (d < 28) [r, g, b] = d < 22 ? [90, 230, 160] : [20, 30, 40];
      else [r, g, b] = [(40 + (180 * x) / W) | 0, 60, (120 + (120 * y) / H) | 0];
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, color type 2 (RGB)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Kitty Graphics Protocol, base64 payload chunked at 4096 bytes.
function kitty(b64, ctrl) {
  const size = 4096;
  const parts = [];
  for (let i = 0; i < b64.length; i += size) parts.push(b64.slice(i, i + size));
  return parts
    .map((p, i) => {
      const more = i < parts.length - 1 ? 1 : 0;
      if (i === 0) {
        const c = Object.entries({ ...ctrl, m: more }).map(([k, v]) => `${k}=${v}`).join(",");
        return `\x1b_G${c};${p}\x1b\\`;
      }
      return `\x1b_Gm=${more};${p}\x1b\\`;
    })
    .join("");
}

// Sixel (DCS q ... ST): a paletted image. Rendered by xterm.js + addon-image.
// Most backends swallow it; wterm's built-in Zig core prints the payload as text
// (left as-is — it shows plainly where a protocol isn't supported).
// `pixel(x,y)` returns a palette index; each 6-row band overlays one color at a time.
function sixel(w, h, pixel, palette) {
  const pc = (v) => Math.round((v / 255) * 100);
  let s = "\x1bP0;1;0q";
  palette.forEach((c, i) => { s += `#${i};2;${pc(c[0])};${pc(c[1])};${pc(c[2])}`; });
  const bands = Math.ceil(h / 6);
  for (let b = 0; b < bands; b++) {
    for (let ci = 0; ci < palette.length; ci++) {
      s += `#${ci}`;
      for (let x = 0; x < w; x++) {
        let mask = 0;
        for (let r = 0; r < 6; r++) { const y = b * 6 + r; if (y < h && pixel(x, y) === ci) mask |= 1 << r; }
        s += String.fromCharCode(63 + mask);
      }
      if (ci < palette.length - 1) s += "$"; // carriage return: overlay next color on this band
    }
    if (b < bands - 1) s += "-"; // next band
  }
  return s + "\x1b\\";
}

// iTerm2 inline image (OSC 1337): base64 of an image file (reuse the PNG).
// `size` (decoded byte length) is required by xterm's addon-image, else it drops it.
function iterm2(pngBase64, size) {
  return `\x1b]1337;File=inline=1;size=${size};width=auto;height=auto:${pngBase64}\x07`;
}

const png = makePng();
const pngB64 = png.toString("base64");
const img = kitty(pngB64, { f: 100, a: "T", c: 14, r: 7 });
// Same green-circle-on-dark motif as the PNG, so all three images look alike.
const sixelImg = sixel(48, 48, (x, y) => (Math.hypot(x - 24, y - 24) < 22 ? 1 : 0), [[20, 30, 40], [90, 230, 160]]);
const iipImg = iterm2(pngB64, png.length);

const header = { version: 2, width: 66, height: 18 }; // landscape, ~16:9; scrolls like a real terminal
const events = [
    [0, "o", "\u001b[2J\u001b[HUnicode playback comparison\r\n\r\n"],
    [0.2, "o", "Combining:   cafe"],
    [0.4, "o", "\u0301  a\u0308  o\u0302\r\n"],
    [0.8, "o", "Skin tones:  👍 👍🏽 👍🏿\r\n"],
    [1.2, "o", "Flags:       🇩🇰 🇯🇵 🇺🇳\r\n"],
    [1.6, "o", "Joined:      👩"],
    [1.7, "o", "🏽‍"],
    [1.8, "o", "💻  👨‍👩‍👧‍👦\r\n"],
    [2.2, "o", "CJK:         日本語 中文 한국어\r\n"],
    [2.6, "o", "Presentation: ♥︎ ♥️  1️⃣\r\n\r\n"],
    [3.0, "o", "Kitty image (wterm libghostty core):\r\n"],
    [3.4, "o", img],
    [3.6, "o", "\r\n\r\nSixel image (xterm.js + addon-image):\r\n"],
    [4.0, "o", sixelImg],
    [4.2, "o", "\r\n\r\niTerm2 inline image (xterm.js + addon-image):\r\n"],
    [4.6, "o", iipImg],
    [4.8, "o", "\r\n\r\n"],
    [5.2, "o", "\u001b[32mDone. Seek backwards and replay.\u001b[0m"],
    [7, "o", ""],
    // Input ("i") events drive the keystroke overlay. They are NOT sent to the
    // terminal backends (those only receive output/reset/resize), so they don't
    // affect rendering — enable keystrokeOverlay (or press 'k') to see them.
    [0.5, "i", "l"], [0.6, "i", "s"], [0.9, "i", "\r"],
    [1.9, "i", "\u0003"],                                 // Ctrl-C
    [2.9, "i", "\u001b[A"], [3.1, "i", "\u001b[B"],        // up / down
    [4.1, "i", "v"], [4.2, "i", "i"], [4.3, "i", "m"], [4.5, "i", "\r"],
    [5.0, "i", "\u001b"],                                 // Esc
  ].sort((a, b) => a[0] - b[0]);
const cast = [header, ...events].map((line) => JSON.stringify(line)).join("\n") + "\n";

const here = dirname(fileURLToPath(import.meta.url));
const targets = process.argv[2]
  ? [resolve(process.argv[2])]
  : [resolve(here, "unicode.cast")]; // used by the comparison launcher index.html
for (const t of targets) {
  writeFileSync(t, cast);
  console.log("wrote", t);
}
