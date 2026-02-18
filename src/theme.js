import { normalizeHexColor } from "./colors.js";

function normalizeTheme(theme) {
  const foreground = normalizeHexColor(theme.foreground);
  const background = normalizeHexColor(theme.background);
  const paletteInput = theme.palette;

  if (paletteInput === undefined) return;
  if (!foreground || !background || paletteInput.length < 8) return;

  const palette = [];
  const limit = Math.min(paletteInput.length, 16);

  for (let i = 0; i < limit; i += 1) {
    const color = normalizeHexColor(paletteInput[i]);
    if (!color) return;
    palette.push(color);
  }

  for (let i = palette.length; i < 16; i += 1) {
    palette.push(palette[i - 8]);
  }

  return { foreground, background, palette };
}

export { normalizeTheme };
