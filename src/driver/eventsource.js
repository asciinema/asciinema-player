import getBuffer from '../buffer';
import Clock from '../clock';
import { PrefixedLogger } from '../logging';

function eventsource({ url, bufferTime = 0.1, minFrameTime }, { feed, reset, setState, logger }) {
  logger = new PrefixedLogger(logger, 'eventsource: ');
  let es;
  let buf;
  let clock;

  function setTime(time) {
    if (clock !== undefined) {
      clock.setTime(time);
    }
  }

  function initBuffer(baseStreamTime) {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(feed, setTime, bufferTime, baseStreamTime, minFrameTime);
  }

  return {
    play: () => {
      es = new EventSource(url);

      es.addEventListener('open', () => {
        logger.info('opened');
        initBuffer();
      });

      es.addEventListener('error', e => {
        logger.info('errored');
        logger.debug({e});
        setState('loading');
      });

      es.addEventListener('message', event => {
        const e = JSON.parse(event.data);

        if (Array.isArray(e)) {
          buf.pushEvent(e);
        } else if (e.cols !== undefined || e.width !== undefined) {
          const cols = e.cols ?? e.width;
          const rows = e.rows ?? e.height;
          logger.debug(`vt reset (${cols}x${rows})`);
          setState('playing');
          initBuffer(e.time);
          reset(cols, rows, e.init ?? undefined);
          clock = new Clock();

          if (typeof e.time === 'number') {
            clock.setTime(e.time);
          }
        } else if (e.state === 'offline') {
          logger.info('stream offline');
          setState('offline');
          clock = undefined;
        }
      });

      es.addEventListener('done', () => {
        logger.info('closed');
        es.close();
        setState('stopped', { reason: 'ended' });
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

export default eventsource;
