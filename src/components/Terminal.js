import Line from './Line';

export default props => {
  const terminalWidth = () => {
    return (props.width || 80) + 'ch';
  }

  const terminalHeight = () => {
    return (1.3333333333 * (props.height || 24)) + 'em';
  }

  const terminalStyle = () => {
    return {
      width: terminalWidth(),
      height: terminalHeight(),
      "font-size": `${(props.terminalScale || 1.0) * 100}%`
    }
  }

  const cursorCol = () => props.cursor?.[0];
  const cursorRow = () => props.cursor?.[1];

  return (
    <pre class="asciinema-terminal" classList={{ blink: props.blink }} style={terminalStyle()} xref={'this.terminalRef'}>
      <For each={props.lines}>
        {(line, i) => <Line segments={line.segments} cursor={i() === cursorRow() ? cursorCol() : null} />}
      </For>
    </pre>
  );
}
