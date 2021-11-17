import { render } from 'solid-js/web';
import Player from './components/Player';

function create(props, elem) {
  let el;

  if (typeof props === 'string') {
    props = { src: props };
  }

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
