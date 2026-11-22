import { render } from "solid-js/web";
import Player from "./components/Player";

function mount(core, elem, opts = {}) {
  let el;

  const dispose = render(() => {
    el = <Player {...opts} core={core} />;
    return el;
  }, elem);

  return { el: el, dispose: dispose };
}

export { mount };
