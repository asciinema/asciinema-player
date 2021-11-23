import buffer from '../buffer';

function eventsource({ url, bufferTime = 0 }, { feed }) {
  const buf = buffer(feed, bufferTime);
  let es;

  return {
    start: () => {
      es = new EventSource(url);

      es.addEventListener('message', event => {
        buf.pushEvent(JSON.parse(event.data));
      });

      es.addEventListener('done', () => {
        es.close();
      });
    },

    stop: () => {
      es.close();
    }
  }
}

export { eventsource };
