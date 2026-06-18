import { createEffect, createSignal, For, onCleanup } from "solid-js";

const VISIBLE_MS = 1200;
const FADE_MS = 700;

function KeystrokePill(props) {
  const [isFading, setIsFading] = createSignal(false);

  createEffect(() => {
    const { id } = props.keystroke;
    props.keystroke.rev();

    setIsFading(false);

    const fadeTimeoutId = setTimeout(function () {
      setIsFading(true);
    }, VISIBLE_MS);

    const expireTimeoutId = setTimeout(function () {
      props.onExpired(id);
    }, VISIBLE_MS + FADE_MS);

    onCleanup(() => {
      clearTimeout(fadeTimeoutId);
      clearTimeout(expireTimeoutId);
    });
  });

  return (
    <div class={isFading() ? "ap-keystroke-pill fading" : "ap-keystroke-pill"}>
      <kbd>{props.keystroke.label()}</kbd>
    </div>
  );
}

export default (props) => {
  return (
    <div
      class="ap-overlay ap-overlay-keystrokes"
      style={{ "--ap-keystrokes-bottom": `${(props.bottomOffset ?? 0) + 12}px` }}
    >
      <For each={props.keystrokes}>
        {(keystroke) => <KeystrokePill keystroke={keystroke} onExpired={props.onExpired} />}
      </For>
    </div>
  );
};
