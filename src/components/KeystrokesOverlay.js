import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { formatKeyCode } from "../keystrokes";

const FADE_DELAY_MS = 1200;

export default (props) => {
  const [isFading, setIsFading] = createSignal(false);
  const keyLabel =
    props.keystroke === null ? "" : formatKeyCode(props.keystroke.value, props.logger);

  createEffect(() => {
    if (keyLabel === "") {
      return;
    }

    setIsFading(false);

    const timeoutId = setTimeout(function () {
      setIsFading(true);
    }, FADE_DELAY_MS);

    onCleanup(() => clearTimeout(timeoutId));
  });

  return (
    <Show when={keyLabel !== ""}>
      <div
        class={
          isFading()
            ? "ap-overlay ap-overlay-keystrokes fading"
            : "ap-overlay ap-overlay-keystrokes"
        }
        style={{ "--ap-keystrokes-bottom": `${(props.bottomOffset ?? 0) + 12}px` }}
      >
        <div>
          <kbd>{keyLabel}</kbd>
        </div>
      </div>
    </Show>
  );
};
