import { render } from 'solid-js/web';
import Player from './components/Player';

function create(src, elem, opts = {}) {
  const props = { src, ...opts };
  let el;

  const dispose = render(() => {
    el = <Player {...props} />;
    return el;
  }, elem);

  return {
    el: el,
    dispose: dispose
  }
}

export { create };
