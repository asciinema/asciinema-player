const FULL_HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/;
const SHORT_HEX_COLOR_REGEX = /^#[0-9a-f]{3}$/;

function normalizeHexColor(color, fallback = undefined) {
  if (typeof color !== "string") return fallback;

  const normalized = color.trim().toLowerCase();

  if (FULL_HEX_COLOR_REGEX.test(normalized)) {
    return normalized;
  }

  if (SHORT_HEX_COLOR_REGEX.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return fallback;
}

function lerpOklab(t, c1, c2) {
  return [c1[0] + t * (c2[0] - c1[0]), c1[1] + t * (c2[1] - c1[1]), c1[2] + t * (c2[2] - c1[2])];
}

function hexToOklab(hex) {
  const [r, g, b] = hexToSrgb(hex).map(srgbToLinear);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToHex(lab) {
  const rgb = oklabToSrgb(lab);
  if (isSrgbInGamut(rgb)) return srgbToHex(rgb);

  const [L, C, h] = oklabToOklch(lab);
  let low = 0;
  let high = C;
  let best = [L, 0, h];

  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    const candidate = [L, mid, h];
    const candidateRgb = oklabToSrgb(oklchToOklab(candidate));

    if (isSrgbInGamut(candidateRgb)) {
      low = mid;
      best = candidate;
    } else {
      high = mid;
    }
  }

  return srgbToHex(oklabToSrgb(oklchToOklab(best)));
}

function oklabToSrgb(lab) {
  const L = clamp(lab[0], 0, 1);
  const a = lab[1];
  const b = lab[2];
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(blue)];
}

function oklabToOklch([L, a, b]) {
  return [L, Math.hypot(a, b), Math.atan2(b, a)];
}

function oklchToOklab([L, C, h]) {
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

function hexToSrgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function rgbToHex(r, g, b) {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function srgbToHex(rgb) {
  return rgbToHex(rgb[0] * 255, rgb[1] * 255, rgb[2] * 255);
}

function srgbToLinear(c) {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * c ** (1 / 2.4) - 0.055;
}

function isSrgbInGamut([r, g, b]) {
  return r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toHexByte(value) {
  const byte = Math.round(clamp(value, 0, 255));
  return byte.toString(16).padStart(2, "0");
}

export { normalizeHexColor, lerpOklab, hexToOklab, oklabToHex, rgbToHex };
