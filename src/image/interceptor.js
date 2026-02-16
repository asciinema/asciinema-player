// Image interceptor - thin wrapper around OSC 1337 parser
// Extracts inline images from terminal data before VT processing

import { OSC1337Parser } from "./osc1337.js";

// Default character dimensions, used as fallback when actual metrics
// are not yet available (e.g. before the terminal is mounted).
const DEFAULT_CHAR_WIDTH_PX = 9;
const DEFAULT_CHAR_HEIGHT_PX = 20;

export function calculateImageRows(imageData, terminalCols, charW, charH) {
  const charWidthPx = charW || DEFAULT_CHAR_WIDTH_PX;
  const charHeightPx = charH || DEFAULT_CHAR_HEIGHT_PX;
  const { width, height, naturalWidth, naturalHeight, preserveAspectRatio } = imageData;

  if (height && height.type === "cells" && height.value !== null) {
    return Math.max(1, Math.ceil(height.value));
  }

  const terminalWidthPx = terminalCols * charWidthPx;

  let displayWidthPx;
  if (width && width.type === "px" && width.value !== null) {
    displayWidthPx = width.value;
  } else if (width && width.type === "cells" && width.value !== null) {
    displayWidthPx = width.value * charWidthPx;
  } else if (width && width.type === "percent" && width.value !== null) {
    displayWidthPx = (width.value / 100) * terminalWidthPx;
  } else if (naturalWidth) {
    displayWidthPx = Math.min(naturalWidth, terminalWidthPx);
  } else {
    displayWidthPx = terminalWidthPx;
  }

  let displayHeightPx;
  if (height && height.type === "px" && height.value !== null) {
    displayHeightPx = height.value;
  } else if (height && height.type === "percent" && height.value !== null) {
    displayHeightPx = 200;
  } else if (naturalWidth && naturalHeight && preserveAspectRatio !== false) {
    const aspectRatio = naturalHeight / naturalWidth;
    displayHeightPx = displayWidthPx * aspectRatio;
  } else if (naturalHeight) {
    displayHeightPx = naturalHeight;
  } else {
    displayHeightPx = displayWidthPx * 0.75;
  }

  return Math.max(1, Math.ceil(displayHeightPx / charHeightPx));
}

export default class ImageInterceptor {
  constructor() {
    this.parser = new OSC1337Parser();
  }

  parse(data) {
    return this.parser.parse(data);
  }

  reset() {
    this.parser.reset();
  }
}
