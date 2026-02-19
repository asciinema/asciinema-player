const CORE_OPTS = [
  'audioUrl',
  'autoPlay',
  'autoplay',
  'boldIsBright',
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
];

const UI_OPTS = [
  'autoPlay',
  'autoplay',
  'cols',
  'adaptivePalette',
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
  opts.adaptivePalette ??= false;
  opts.controls ??= "auto";

  return { ...opts, ...overrides };
}

export { coreOpts, uiOpts };
