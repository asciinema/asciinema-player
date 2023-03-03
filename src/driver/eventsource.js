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

        if (e.cols !== undefined || e.width !== undefined) {
          initBuffer();
          reset(e.cols ?? e.width, e.rows ?? e.height);
          clock = new Clock();
        } else {
          buf.pushEvent(e);
          clock.setTime(e[0]);
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
        return 0;
      } else {
        return clock.getTime();
      }
    }
  }
}

export { eventsource };
