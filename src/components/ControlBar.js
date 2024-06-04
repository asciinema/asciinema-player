import { Match, Switch, createMemo, createSignal, onCleanup } from "solid-js";
import { throttle } from "../util";

function formatTime(seconds) {
  let s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s %= 60;

  if (d > 0) {
    return `${zeroPad(d)}:${zeroPad(h)}:${zeroPad(m)}:${zeroPad(s)}`;
  } else if (h > 0) {
    return `${zeroPad(h)}:${zeroPad(m)}:${zeroPad(s)}`;
  } else {
    return `${zeroPad(m)}:${zeroPad(s)}`;
  }
}

function zeroPad(n) {
  return n < 10 ? `0${n}` : n.toString();
}

export default (props) => {
  const e = (f) => {
    return (e) => {
      e.preventDefault();
      f(e);
    };
  };

  const currentTime = () =>
    typeof props.currentTime === "number" ? formatTime(props.currentTime) : "--:--";

  const remainingTime = () =>
    typeof props.remainingTime === "number" ? "-" + formatTime(props.remainingTime) : currentTime();

  const markers = createMemo(() =>
    typeof props.duration === "number" ? props.markers.filter((m) => m[0] < props.duration) : [],
  );

  const markerPosition = (m) => `${(m[0] / props.duration) * 100}%`;

  const markerText = (m) => {
    if (m[1] === "") {
      return formatTime(m[0]);
    } else {
      return `${formatTime(m[0])} - ${m[1]}`;
    }
  };

  const isPastMarker = (m) =>
    typeof props.currentTime === "number" ? m[0] <= props.currentTime : false;

  const gutterBarStyle = () => {
    return {
      transform: `scaleX(${props.progress || 0}`,
    };
  };

  const calcPosition = (e) => {
    const barWidth = e.currentTarget.offsetWidth;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pos = Math.max(0, mouseX / barWidth);

    return `${pos * 100}%`;
  };

  const [mouseDown, setMouseDown] = createSignal(false);
  const throttledSeek = throttle(props.onSeekClick, 50);

  const onMouseDown = (e) => {
    if (e._marker) return;
    if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey || e.button !== 0) return;

    setMouseDown(true);
    props.onSeekClick(calcPosition(e));
  };

  const seekToMarker = (index) => {
    return e(() => {
      props.onSeekClick({ marker: index });
    });
  };

  const onMove = (e) => {
    if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) return;

    if (mouseDown()) {
      throttledSeek(calcPosition(e));
    }
  };

  const onDocumentMouseUp = () => {
    setMouseDown(false);
  };

  document.addEventListener("mouseup", onDocumentMouseUp);

  onCleanup(() => {
    document.removeEventListener("mouseup", onDocumentMouseUp);
  });

  return (
    <div class="ap-control-bar" classList={{ "ap-seekable": props.isSeekable }} ref={props.ref}>
      <Show when={props.isPausable}>
        <span class="ap-playback-button" onClick={e(props.onPlayClick)}>
          <Switch>
            <Match when={props.isPlaying}>
              <svg
                version="1.1"
                viewBox="0 0 12 12"
                class="ap-icon"
                aria-label="Pause"
                role="button"
                tabindex="0"
              >
                <path d="M1,0 L4,0 L4,12 L1,12 Z"></path>
                <path d="M8,0 L11,0 L11,12 L8,12 Z"></path>
              </svg>
            </Match>
            <Match when={!props.isPlaying}>
              <svg
                version="1.1"
                viewBox="0 0 12 12"
                class="ap-icon"
                aria-label="Play"
                role="button"
                tabindex="0"
              >
                <path d="M1,0 L11,6 L1,12 Z"></path>
              </svg>
            </Match>
          </Switch>
        </span>
      </Show>

      <span class="ap-timer" aria-readonly="true" role="textbox" tabindex="0">
        <span class="ap-time-elapsed">{currentTime()}</span>
        <span class="ap-time-remaining">{remainingTime()}</span>
      </span>

      <Show when={typeof props.progress === "number" || props.isSeekable}>
        <span class="ap-progressbar">
          <span class="ap-bar" onMouseDown={onMouseDown} onMouseMove={onMove}>
            <span class="ap-gutter ap-gutter-empty"></span>
            <span class="ap-gutter ap-gutter-full" style={gutterBarStyle()}></span>
            <For each={markers()}>
              {(m, i) => (
                <span
                  class="ap-marker-container ap-tooltip-container"
                  style={{ left: markerPosition(m) }}
                  onClick={seekToMarker(i())}
                  onMouseDown={(e) => {
                    e._marker = true;
                  }}
                >
                  <span class="ap-marker" classList={{ "ap-marker-past": isPastMarker(m) }}></span>
                  <span class="ap-tooltip">{markerText(m)}</span>
                </span>
              )}
            </For>
          </span>
        </span>
      </Show>

      <span
        class="ap-fullscreen-button ap-tooltip-container"
        onClick={e(props.onFullscreenClick)}
        aria-label="Toggle fullscreen mode"
        role="button"
        tabindex="0"
      >
        <svg version="1.1" viewBox="0 0 12 12" class="ap-icon ap-icon-fullscreen-on">
          <path d="M12,0 L7,0 L9,2 L7,4 L8,5 L10,3 L12,5 Z"></path>
          <path d="M0,12 L0,7 L2,9 L4,7 L5,8 L3,10 L5,12 Z"></path>
        </svg>
        <svg version="1.1" viewBox="0 0 12 12" class="ap-icon ap-icon-fullscreen-off">
          <path d="M7,5 L7,0 L9,2 L11,0 L12,1 L10,3 L12,5 Z"></path>
          <path d="M5,7 L0,7 L2,9 L0,11 L1,12 L3,10 L5,12 Z"></path>
        </svg>
        <span class="ap-tooltip">Fullscreen (f)</span>
      </span>
    </div>
  );
};
