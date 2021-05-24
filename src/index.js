import { render } from 'solid-js/web';
import AsciinemaPlayer from './components/AsciinemaPlayer';

window.createAsciinemaPlayer = (url, opts, elem) => {
  render(() => (<AsciinemaPlayer src={url} size={opts.size} />), elem);
}
