import getBuffer from "../buffer";
import { Clock, NullClock } from "../clock";
import { PrefixedLogger } from "../logging";

function eventsource({ url, bufferTime, minFrameTime }, { dispatch, logger }) {
  logger = new PrefixedLogger(logger, "eventsource: ");
  let es;
  let buf;
  let clock = new NullClock();

  function initBuffer(baseStreamTime) {
    if (buf !== undefined) buf.stop();

    buf = getBuffer(
      bufferTime,
      dispatch,
      (t) => clock.setTime(t),
      baseStreamTime,
      minFrameTime,
      logger,
    );
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
          clock = new Clock();

          if (time !== undefined) {
            clock.setTime(time);
          }

          dispatch("playing");
        } else if (e.state === "offline") {
          logger.info("stream offline");
          dispatch("offline", { message: "Stream offline" });
          clock = new NullClock();
        }
      });

      es.addEventListener("done", () => {
        logger.info("closed");
        es.close();
        dispatch("ended", { message: "Stream ended" });
      });

      return true;
    },

    stop: () => {
      if (buf !== undefined) buf.stop();
      if (es !== undefined) es.close();
    },

    getCurrentTime: () => {
      const t = clock.getTime();
      return typeof t === "number" ? t / 1000 : t;
    },
  };
}

export default eventsource;
