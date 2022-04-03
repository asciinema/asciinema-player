import { onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import Terminal from "./Terminal";

export default props => {
  const symbols = ['▓', '▒', '░', '▒'];
  let intervalId;
  let i = 1;
  let paddingText = '';

  for (let c = 0; c < props.cols - 1; c++) {
    paddingText = paddingText.concat(' ');
  }

  const padding = [paddingText, new Map()];
  const attrs = new Map([['inverse', true]]);
  const line = {segments: [padding, [symbols[0], attrs]]};
  const [state, setState] = createStore({lines: [line]});

  onMount(() => {
    intervalId = setInterval(() => {
      const symbol = symbols[i % symbols.length];
      const line = {segments: [padding, [symbol, attrs]]};
      setState('lines', 0, line);
      i++;
    }, 250);
  });

  onCleanup(() => {
    clearInterval(intervalId);
  });

  return (
    <div class="loading">
      <Terminal cols={props.cols} rows={props.rows} scale={props.scale} lines={state.lines} fontFamily={props.terminalFontFamily} lineHeight={props.terminalLineHeight} />
    </div>
  );
}
