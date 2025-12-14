import { createMemo } from "solid-js";
import Line from "./Line";

export default (props) => {
  const lineHeight = () => props.lineHeight ?? 1.3333333333;

  const style = createMemo(() => {
    return {
      width: `${props.cols}ch`,
      height: `${lineHeight() * props.rows}em`,
      "font-size": `${(props.scale || 1.0) * 100}%`,
      "--term-line-height": `${lineHeight()}em`,
      "--term-cols": props.cols,
      "--term-rows": props.rows,
    };
  });

  function bgStyle(color) {
    if (typeof color === "number") {
      return { fill: `var(--term-color-${color})` };
    } else if (typeof color === "string") {
      if (color == "fg") {
        return { fill: "var(--term-color-foreground)" };
      } else {
        return { fill: color };
      }
    }
  }

  const cursorCol = createMemo(() => props.cursor?.[0]);
  const cursorRow = createMemo(() => props.cursor?.[1]);

  return (
    <div class="ap-term" style={style()}>
      <svg
        class="ap-term-bg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${props.cols} ${props.rows}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <g shape-rendering="crispEdges">
          <For each={props.lines}>
            {(line, row) => (
              <For each={line.bg}>
                {(span, _i) => (
                  <rect x={span.x} y={row()} width={span.w} height="1" style={bgStyle(span.c)} />
                )}
              </For>
            )}
          </For>
        </g>
      </svg>
      <pre
        class="ap-term-text"
        classList={{ "ap-cursor-on": props.blink || props.cursorHold, "ap-blink": props.blink }}
        ref={props.ref}
        aria-live="off"
        tabindex="0"
      >
        <For each={props.lines}>
          {(line, i) => (
            <Line segments={line.fg} row={i()} cursor={i() === cursorRow() ? cursorCol() : null} />
          )}
        </For>
      </pre>
    </div>
  );
};
