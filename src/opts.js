const CORE_OPTS = [
  "audioUrl",
  "autoPlay",
  "autoplay",
  "cols",
  "idleTimeLimit",
  "loop",
  "markers",
  "pauseOnMarkers",
  "poster",
  "preload",
  "rows",
  "speed",
  "startAt",
];

const UI_OPTS = [
  "autoPlay",
  "autoplay",
  "boldIsBright",
  "cols",
  "adaptivePalette",
  "controls",
  "cursorMode",
  "fit",
  "hideKeystroke",
  "rows",
  "terminalFontFamily",
  "terminalFontSize",
  "terminalLineHeight",
  "theme",
];

function coreOpts(inputOpts, overrides = {}) {
  const opts = Object.fromEntries(
    Object.entries(inputOpts).filter(([key]) => CORE_OPTS.includes(key)),
  );

  opts.autoPlay ??= opts.autoplay;
  opts.speed ??= 1.0;

  return { ...opts, ...overrides };
}

function uiOpts(inputOpts, overrides = {}) {
  const opts = Object.fromEntries(
    Object.entries(inputOpts).filter(([key]) => UI_OPTS.includes(key)),
  );

  opts.autoPlay ??= opts.autoplay;
  opts.adaptivePalette ??= false;
  opts.controls ??= "auto";
  opts.cursorMode ??= "blinking";
  opts.hideKeystroke ??= true;

  if (!["blinking", "steady", "hidden"].includes(opts.cursorMode)) {
    throw new Error(`unsupported cursor mode: ${opts.cursorMode}`);
  }

  return { ...opts, ...overrides };
}

export { coreOpts, uiOpts };
