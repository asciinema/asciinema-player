import { render } from 'solid-js/web';
import AsciinemaPlayer from './components/AsciinemaPlayer';

function create(props, elem) {
  return render(() => (<AsciinemaPlayer {...props} />), elem);
}

export { create };
