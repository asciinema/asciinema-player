import { normalizeTheme } from "../theme";

async function loadSegmentedRecording(src, { startAt = 0 } = {}) {
  if (typeof src.url !== "string") {
    throw new Error("segmented recording source requires a URL");
  }

  const response = await fetchResponse(src.url, src.fetchOpts ?? {});
  let index;

  try {
    index = await response.json();
  } catch (error) {
    throw new Error(`failed parsing segmented recording index from ${src.url}: ${error.message}`);
  }

  validateIndex(index);

  const duration = index.duration * 1000;
  const markers = (index.markers ?? []).map(([time, label]) => [time * 1000, label]);
  const segments = index.segments.map((segment) => ({
    start: segment.start * 1000,
    url: resolveUrl(segment.url, response.url || src.url),
  }));
  const recording = {
    cols: index.term.cols,
    rows: index.term.rows,
    theme: parseTheme(index.term.theme),
    duration,
    effectiveStartAt: Math.min(Math.max(startAt * 1000, 0), duration),
    markers,
    segments,
    async loadSegment(segment) {
      const segmentIndex = segments.indexOf(segment);

      if (segmentIndex === -1) {
        throw new Error("unknown recording segment");
      }

      const segmentResponse = await fetchResponse(segment.url, src.fetchOpts ?? {});
      let payload;

      try {
        payload = await segmentResponse.json();
      } catch (error) {
        throw new Error(`failed parsing recording segment from ${segment.url}: ${error.message}`);
      }

      return normalizeSegment(recording, segmentIndex, payload);
    },
  };

  return recording;
}

function validateSegmentedOptions(src, { idleTimeLimit, markers }) {
  if (src.format !== "segmented") return;

  const unsupported = [];

  if (idleTimeLimit !== undefined) unsupported.push("idleTimeLimit");
  if (markers !== undefined) unsupported.push("markers");

  for (const option of ["inputOffset", "parser", "encoding"]) {
    if (Object.hasOwn(src, option)) unsupported.push(option);
  }

  if (unsupported.length > 0) {
    throw new Error(`segmented recordings do not support option: ${unsupported.join(", ")}`);
  }
}

function validateIndex(index) {
  if (index?.version !== 1) {
    throw new Error(`unsupported segmented recording version: ${JSON.stringify(index?.version)}`);
  }

  validateFiniteTime(index.duration, "recording duration");
  validateTerminalSize(index.term, "recording terminal");

  if (!Array.isArray(index.segments) || index.segments.length === 0) {
    throw new Error("segmented recording index is missing segments");
  }

  let previousStart = -1;

  index.segments.forEach((segment, i) => {
    validateFiniteTime(segment?.start, `segment ${i} start`);

    if (typeof segment?.url !== "string" || segment.url.length === 0) {
      throw new Error(`segment ${i} is missing its URL`);
    }

    if (i === 0 && segment.start !== 0) {
      throw new Error("first segment must start at 0");
    }

    if (i > 0 && (segment.start <= previousStart || segment.start >= index.duration)) {
      throw new Error(`segment ${i} start must be strictly increasing and before duration`);
    }

    previousStart = segment.start;
  });

  if (index.markers !== undefined && !Array.isArray(index.markers)) {
    throw new Error("segmented recording markers must be an array");
  }

  let previousMarkerTime = -1;

  for (const [i, marker] of (index.markers ?? []).entries()) {
    if (!Array.isArray(marker) || marker.length !== 2 || typeof marker[1] !== "string") {
      throw new Error(`invalid marker ${i} in segmented recording index`);
    }

    validateFiniteTime(marker[0], `marker ${i} time`);

    if (marker[0] < previousMarkerTime || marker[0] > index.duration) {
      throw new Error(`marker ${i} time is out of order or range`);
    }

    previousMarkerTime = marker[0];
  }
}

function normalizeSegment(recording, index, payload) {
  const snapshot = payload?.snapshot;
  validateTerminalSize(snapshot, `segment ${index} snapshot`);

  if (typeof snapshot.init !== "string") {
    throw new Error(`segment ${index} snapshot init must be a string`);
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new Error(`segment ${index} is missing events`);
  }

  const start = recording.segments[index].start;
  const end = recording.segments[index + 1]?.start ?? recording.duration;
  let previousTime = -1;
  let markerIndex = recording.markers.findIndex(([time]) => time >= start);

  if (markerIndex === -1) markerIndex = recording.markers.length;

  const events = payload.events.map((event, eventIndex) => {
    if (!Array.isArray(event) || event.length !== 3 || typeof event[1] !== "string") {
      throw new Error(`invalid event ${eventIndex} in segment ${index}`);
    }

    const time = event[0] * 1000;
    validateFiniteTime(time, `event ${eventIndex} time in segment ${index}`, true);

    if (
      time < previousTime ||
      time < start ||
      (index + 1 < recording.segments.length ? time >= end : time > end)
    ) {
      throw new Error(`event ${eventIndex} time is out of range in segment ${index}`);
    }

    previousTime = time;

    if (event[1] === "m") {
      if (typeof event[2] !== "string") {
        throw new Error(`marker event ${eventIndex} in segment ${index} must have a string label`);
      }

      return [time, "m", { index: markerIndex++, time, label: event[2] }];
    }

    return [time, event[1], event[2]];
  });

  if (index > 0 && events[0][0] !== start) {
    throw new Error(`segment ${index} first event must match its start`);
  }

  if (
    index === recording.segments.length - 1 &&
    events[events.length - 1][0] !== recording.duration
  ) {
    throw new Error("final segment event must match recording duration");
  }

  return {
    snapshot: { cols: snapshot.cols, rows: snapshot.rows, init: snapshot.init },
    events,
  };
}

async function fetchResponse(url, fetchOpts) {
  const response = await fetch(url, fetchOpts);

  if (!response.ok) {
    throw new Error(
      `failed fetching recording from ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

function validateFiniteTime(value, label, milliseconds = false) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${label} must be a finite non-negative ${milliseconds ? "millisecond" : "second"} value`,
    );
  }
}

function validateTerminalSize(term, label) {
  if (
    !Number.isInteger(term?.cols) ||
    term.cols <= 0 ||
    !Number.isInteger(term?.rows) ||
    term.rows <= 0
  ) {
    throw new Error(`${label} must have positive integer cols and rows`);
  }
}

function parseTheme(theme) {
  return normalizeTheme({
    foreground: theme?.fg,
    background: theme?.bg,
    palette: typeof theme?.palette === "string" ? theme.palette.split(":") : undefined,
  });
}

function resolveUrl(url, indexUrl) {
  return new URL(url, new URL(indexUrl, globalThis.location?.href ?? "http://localhost/")).href;
}

export { loadSegmentedRecording, validateSegmentedOptions };
