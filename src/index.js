import { render } from 'solid-js/web';
import AsciinemaPlayer from './components/AsciinemaPlayer';

function create(props, elem) {
  let el;

  const dispose = render(() => {
    el = <AsciinemaPlayer {...props} />;
    return el;
  }, elem);

  return {
    el: el,
    dispose: dispose
  }
}

export { create };
