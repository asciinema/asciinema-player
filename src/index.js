import { render } from 'solid-js/web';
import Player from './components/Player';

function create(props, elem) {
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
