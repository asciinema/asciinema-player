import AsciinemaPlayerCore from '../core';
import { createState } from 'solid-js';


export default props => {
  const core = AsciinemaPlayerCore.build(props.src, {
    loop: props.loop || false,
    cols: props.cols,
    rows: props.rows
  }, () => onFinish());

  const [state, setState] = createState({
    state: 'initial',
    width: props.cols,
    height: props.rows,
    lines: [],
    cursor: null,
    isSeekable: core.isSeekable(),
    isPausable: core.isPausable(),
    showControls: false,
    blink: true,
    lol: 'no no'
  });

  function onFinish() {
    setState({ lol: 'yup yup' });
  }

  core.start();

  return <div>Hello! {state.lol}</div>;
}
