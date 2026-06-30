import Stream from "../../stream";

async function loadFullRecording(src, options) {
  return wrapFullRecording(prepareRecording(await loadRecording(src), options));
}

async function loadRecording(src) {
  const { parser, encoding = "utf-8" } = src;
  const data = await doFetch(src);

  return await parser(data, { encoding });
}

function wrapFullRecording(recording) {
  const segment = { start: 0 };

  const markers = recording.events
    .filter((event) => event[1] === "m")
    .map((event) => [event[0], event[2].label]);

  return {
    cols: recording.cols,
    rows: recording.rows,
    theme: recording.theme,
    duration: recording.duration,
    effectiveStartAt: recording.effectiveStartAt,
    markers,
    segments: [segment],

    async loadSegment(index) {
      if (index !== 0) {
        throw new Error("unknown recording segment");
      }

      return {
        snapshot: { cols: recording.cols, rows: recording.rows, init: "" },
        events: recording.events,
      };
    },
  };
}

async function doFetch({ url, data, fetchOpts = {} }) {
  if (typeof url === "string") {
    return await doFetchOne(url, fetchOpts);
  } else if (Array.isArray(url)) {
    return await Promise.all(url.map((url) => doFetchOne(url, fetchOpts)));
  } else if (data !== undefined) {
    if (typeof data === "function") {
      data = data();
    }

    if (!(data instanceof Promise)) {
      data = Promise.resolve(data);
    }

    const value = await data;

    if (typeof value === "string" || value instanceof ArrayBuffer) {
      return new Response(value);
    } else {
      return value;
    }
  } else {
    throw new Error("failed fetching recording file: url/data missing in src");
  }
}

async function doFetchOne(url, fetchOpts) {
  const response = await fetch(url, fetchOpts);

  if (!response.ok) {
    throw new Error(
      `failed fetching recording from ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

function prepareRecording(recording, { startAt = 0, idleTimeLimit, inputOffset, markers }) {
  let { events } = recording;

  if (!(events instanceof Stream)) {
    events = new Stream(events);
  }

  startAt = startAt * 1000;
  idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit;
  idleTimeLimit = idleTimeLimit !== undefined ? idleTimeLimit * 1000 : Infinity;
  inputOffset = inputOffset !== undefined ? inputOffset * 1000 : undefined;
  const limiterOutput = { offset: 0 };

  events = events.map(timeLimiter(idleTimeLimit, startAt, limiterOutput));

  if (markers !== undefined) {
    markers = new Stream(markers).map(normalizeMarker);
    events = events.filter((e) => e[1] !== "m").multiplex(markers, (a, b) => a[0] < b[0]);
  }

  events = events.map(markerWrapper());
  events = events.toArray();

  if (inputOffset !== undefined) {
    events = events.map((e) => (e[1] === "i" ? [e[0] + inputOffset, e[1], e[2]] : e));
    events.sort((a, b) => a[0] - b[0]);
  }

  if (events.length === 0) {
    throw new Error("recording is missing events");
  }

  const duration = events[events.length - 1][0];
  const effectiveStartAt = startAt - limiterOutput.offset;

  return { ...recording, events, duration, effectiveStartAt };
}

function normalizeMarker(marker) {
  return typeof marker === "number" ? [marker * 1000, "m", ""] : [marker[0] * 1000, "m", marker[1]];
}

function timeLimiter(idleTimeLimit, startAt, output) {
  let previousTime = 0;
  let shift = 0;

  return function (event) {
    const delay = event[0] - previousTime;
    const delta = delay - idleTimeLimit;
    previousTime = event[0];

    if (delta > 0) {
      shift += delta;

      if (event[0] < startAt) {
        output.offset += delta;
      }
    }

    return [event[0] - shift, event[1], event[2]];
  };
}

function markerWrapper() {
  let index = 0;

  return function (event) {
    if (event[1] === "m") {
      return [event[0], event[1], { index: index++, time: event[0], label: event[2] }];
    } else {
      return event;
    }
  };
}

export { loadFullRecording, loadRecording, prepareRecording };
