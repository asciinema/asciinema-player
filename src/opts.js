const CORE_OPTS = [
  'autoPlay',
  'autoplay',
  'cols',
  'idleTimeLimit',
  'loop',
  'markers',
  'pauseOnMarkers',
  'poster',
  'preload',
  'rows',
  'speed',
  'startAt',
  'audioUrl',
];

const UI_OPTS = [
  'autoPlay',
  'autoplay',
  'cols',
  'controls',
  'fit',
  'rows',
  'terminalFontFamily',
  'terminalFontSize',
  'terminalLineHeight',
  'theme',
];

function coreOpts(inputOpts, overrides = {}) {
  const opts = Object.fromEntries(
    Object.entries(inputOpts).filter(([key]) => CORE_OPTS.includes(key))
  );

  opts.autoPlay ??= opts.autoplay;
  opts.speed ??= 1.0;

  return { ...opts, ...overrides };
}

function uiOpts(inputOpts, overrides = {}) {
  const opts = Object.fromEntries(
    Object.entries(inputOpts).filter(([key]) => UI_OPTS.includes(key))
  );

  opts.autoPlay ??= opts.autoplay;
  opts.controls ??= "auto";

  return { ...opts, ...overrides };
}

export { coreOpts, uiOpts };
