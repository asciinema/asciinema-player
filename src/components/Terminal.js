import Line from './Line';

export default props => {
  const terminalStyle = () => {
    return {
      width: `${props.width}ch`,
      height: `${1.3333333333 * props.height}em`,
      "font-size": `${(props.scale || 1.0) * 100}%`
    }
  }

  const cursorCol = () => props.cursor?.[0];
  const cursorRow = () => props.cursor?.[1];

  return (
    <pre class="asciinema-terminal" classList={{ blink: props.blink }} style={terminalStyle()} ref={props.ref}>
      <For each={props.lines}>
        {(line, i) => <Line segments={line.segments} cursor={i() === cursorRow() ? cursorCol() : null} />}
      </For>
    </pre>
  );
}
