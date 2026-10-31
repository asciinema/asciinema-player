// Shared timestamps keep window and worker clocks on the same time origin.
// Time is in seconds; rate is playback seconds per real second (0 for a stationary snapshot).
export function createTiming(time, rate) {
  return { time, rate, sampledAt: performance.timeOrigin + performance.now() };
}

export function getTime(timing) {
  if (typeof timing?.time !== "number") return null;

  const elapsed = performance.timeOrigin + performance.now() - timing.sampledAt;
  return timing.time + (elapsed / 1000) * timing.rate;
}
