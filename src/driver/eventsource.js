import getBuffer from "../buffer";
import { Clock } from "../clock";
import { PrefixedLogger } from "../logging";

function eventsource({ url, bufferTime, minFrameTime }, { dispatch, logger }) {
  logger = new PrefixedLogger(logger, "eventsource: ");
  const clock = new Clock((timing) => dispatch("timing", timing));
  let es;
  let buf;

  function initBuffer(baseStreamTime) {
    stopBuffer();
    clock.stop();

    buf = getBuffer(
      bufferTime,
      dispatch,
      // Buffered frames can finish after the stream ends; preserve the stopped rate.
      (t) => clock.setTime(t / 1000),
      baseStreamTime,
      minFrameTime,
      logger,
    );
  }

  function stopBuffer() {
    if (buf !== undefined) buf.stop();
    buf = undefined;
  }

  return {
    play: () => {
      if (es) return true;

      dispatch("play");

      es = new EventSource(url);

      es.addEventListener("open", () => {
        logger.info("opened");
        initBuffer();
      });

      es.addEventListener("error", (e) => {
        logger.info("errored");
        logger.debug({ e });
        clock.stop();
        dispatch("loading");
      });

      es.addEventListener("message", (event) => {
        const e = JSON.parse(event.data);

        if (Array.isArray(e)) {
          buf.pushEvent([e[0] * 1000, e[1], e[2]]);
        } else if (e.cols !== undefined || e.width !== undefined) {
          const cols = e.cols ?? e.width;
          const rows = e.rows ?? e.height;
          const time = typeof e.time === "number" ? e.time * 1000 : undefined;
          logger.debug(`vt reset (${cols}x${rows})`);
          initBuffer(time);
          dispatch("reset", { size: { cols, rows }, init: e.init ?? undefined });
          clock.setTime((time ?? 0) / 1000, 1);
          dispatch("playing");
        } else if (e.state === "offline") {
          logger.info("stream offline");
          clock.stop();
          dispatch("offline", { message: "Stream offline" });
        }
      });

      es.addEventListener("done", () => {
        logger.info("closed");
        es.close();
        clock.stop();
        dispatch("ended", { message: "Stream ended" });
      });

      return true;
    },

    stop: () => {
      stopBuffer();
      clock.stop();
      if (es !== undefined) es.close();
    },

    getTiming: () => clock.getTiming(),
  };
}

export default eventsource;
