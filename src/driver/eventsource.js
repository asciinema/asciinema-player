import getBuffer from '../buffer';
import Clock from '../clock';

function eventsource({ url, bufferTime = 0 }, { feed, reset, setWaiting, onFinish, logger }) {
  let es;
  let buf;
  let clock;

  function initBuffer() {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(feed, bufferTime);
  }

  return {
    start: () => {
      es = new EventSource(url);

      es.addEventListener('open', () => {
        logger.info('eventsource: opened');
        setWaiting(false);
        initBuffer();
      });

      es.addEventListener('error', e => {
        logger.info('eventsource: errored');
        logger.debug({e});
        setWaiting(true);
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
          initBuffer();
          reset(cols, rows, e.init ?? undefined);
          clock = new Clock();

          if (e.time !== undefined) {
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
        onFinish();
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
