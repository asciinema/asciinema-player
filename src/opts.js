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
  "keystrokeOverlay",
  "rows",
  "terminalFontFamily",
  "terminalFontSize",
  "terminalLineHeight",
  "theme",
];

// JSON-generating hosts can't express undefined and send null for unset options,
// so a nullish value is treated the same as an absent key.
function pick(inputOpts, keys) {
  return Object.fromEntries(
    Object.entries(inputOpts).filter(([key, value]) => keys.includes(key) && value != null),
  );
}

// JSON.stringify renders Infinity and NaN as null and throws on BigInt,
// so quote only strings with it and render everything else with String().
function repr(value) {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

// Returns fresh [time, label] pairs, so later mutation of the caller's array
// can't affect the player and custom drivers always see one marker shape.
function normalizeMarkers(markers) {
  if (!Array.isArray(markers)) {
    throw new Error(`markers option must be an array, got: ${repr(markers)}`);
  }

  return markers.map((m, i) => {
    if (Number.isFinite(m)) return [m, ""];

    if (Array.isArray(m) && Number.isFinite(m[0]) && typeof m[1] === "string") {
      return [m[0], m[1]];
    }

    throw new Error(`invalid marker at index ${i}: expected a number or a [number, string] pair`);
  });
}

function coreOpts(inputOpts, overrides = {}) {
  const opts = pick(inputOpts, CORE_OPTS);

  opts.autoPlay ??= opts.autoplay;
  opts.speed ??= 1.0;

  if (opts.markers !== undefined) {
    opts.markers = normalizeMarkers(opts.markers);
  }

  if (!Number.isFinite(opts.speed) || opts.speed <= 0) {
    throw new Error(`speed option must be a positive number, got: ${repr(opts.speed)}`);
  }

  return { ...opts, ...overrides };
}

function uiOpts(inputOpts, overrides = {}) {
  const opts = pick(inputOpts, UI_OPTS);

  opts.autoPlay ??= opts.autoplay;
  opts.adaptivePalette ??= false;
  opts.controls ??= "auto";
  opts.cursorMode ??= "blinking";
  opts.keystrokeOverlay ??= false;

  if (!["blinking", "steady", "hidden"].includes(opts.cursorMode)) {
    throw new Error(`unsupported cursor mode: ${opts.cursorMode}`);
  }

  if (typeof opts.keystrokeOverlay !== "boolean") {
    throw new Error(`unsupported keystroke overlay option: ${opts.keystrokeOverlay}`);
  }

  return { ...opts, ...overrides };
}

export { coreOpts, uiOpts };
