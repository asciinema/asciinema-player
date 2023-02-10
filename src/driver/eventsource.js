import getBuffer from '../buffer';

function eventsource({ url, bufferTime = 0 }, { feed, reset, setWaiting, onFinish }) {
  let es;
  let buf;

  function initBuffer() {
    if (buf !== undefined) buf.stop();
    buf = getBuffer(feed, bufferTime);
  }

  return {
    start: () => {
      es = new EventSource(url);

      es.addEventListener('open', () => {
        console.debug('eventsource: opened');
        setWaiting(false);
        initBuffer();
      });

      es.addEventListener('error', e => {
        console.debug('eventsource: errored');
        console.debug(e);
        setWaiting(true);
      });

      es.addEventListener('message', event => {
        const e = JSON.parse(event.data);

        if (e.cols !== undefined || e.width !== undefined) {
          initBuffer();
          reset(e.cols ?? e.width, e.rows ?? e.height);
        } else {
          buf.pushEvent(e);
        }
      });

      es.addEventListener('done', () => {
        console.debug('eventsource: closed');
        es.close();
        onFinish();
      });
    },

    stop: () => {
      if (buf !== undefined) buf.stop();
      if (es !== undefined) es.close();
    }
  }
}

export { eventsource };
