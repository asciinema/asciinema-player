import { createMemo } from "solid-js";
import Line from "./Line";

export default (props) => {
  const lineHeight = () => props.lineHeight ?? 1.3333333333;

  const style = createMemo(() => {
    return {
      width: `${props.cols}ch`,
      height: `${lineHeight() * props.rows}em`,
      "font-size": `${(props.scale || 1.0) * 100}%`,
      "font-family": props.fontFamily,
      "--term-line-height": `${lineHeight()}em`,
      "--term-cols": props.cols,
    };
  });

  const cursorCol = createMemo(() => props.cursor?.[0]);
  const cursorRow = createMemo(() => props.cursor?.[1]);

  return (
    <pre
      class="ap-terminal"
      classList={{ "ap-cursor-on": props.blink || props.cursorHold, "ap-blink": props.blink }}
      style={style()}
      ref={props.ref}
      aria-live="off"
      tabindex="0"
    >
      <For each={props.lines}>
        {(line, i) => (
          <Line segments={line.segments} cursor={i() === cursorRow() ? cursorCol() : null} />
        )}
      </For>
    </pre>
  );
};
