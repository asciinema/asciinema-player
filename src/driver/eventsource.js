import getBuffer from '../buffer';
import Clock from '../clock';

function eventsource({ url, bufferTime = 0.1 }, { feed, reset, setState, logger }) {
  let es;
  let buf;
  let clock;

  function initBuffer(baseStreamTime) {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(feed, bufferTime, baseStreamTime);
  }

  return {
    start: () => {
      es = new EventSource(url);

      es.addEventListener('open', () => {
        logger.info('eventsource: opened');
        setState('playing');
        initBuffer();
      });

      es.addEventListener('error', e => {
        logger.info('eventsource: errored');
        logger.debug({e});
        setState('loading');
      });

      es.addEventListener('message', event => {
        const e = JSON.parse(event.data);

        if (Array.isArray(e)) {
          buf.pushEvent(e);

          if (clock !== undefined) {
            clock.setTime(e[0]);
          }
        } else if (e.cols !== undefined || e.width !== undefined) {
          const cols = e.cols ?? e.width;
          const rows = e.rows ?? e.height;
          logger.debug(`eventsource: vt reset (${cols}x${rows})`);
          initBuffer(e.time);
          reset(cols, rows, e.init ?? undefined);
          clock = new Clock();

          if (typeof e.time === 'number') {
            clock.setTime(e.time);
          }
        } else if (e.state === 'offline') {
          logger.info('eventsource: stream offline');
          clock = undefined;
        }
      });

      es.addEventListener('done', () => {
        logger.info('eventsource: closed');
        es.close();
        setState('ended');
      });
    },

    stop: () => {
      if (buf !== undefined) buf.stop();
      if (es !== undefined) es.close();
    },

    getCurrentTime: () => {
      if (clock === undefined) {
        return undefined;
      } else {
        return clock.getTime();
      }
    }
  }
}

export { eventsource };
