import { render } from 'solid-js/web';
import AsciinemaPlayer from './components/AsciinemaPlayer';

if (window) {
  window.createAsciinemaPlayer = (props, elem) => {
    return render(() => (<AsciinemaPlayer {...props} />), elem);
  }
}
