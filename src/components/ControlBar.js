import {
  Match,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  For,
} from "solid-js";
import { throttle } from "../util";
import ExpandIcon from "./icons/ExpandIcon";
import KeyboardIcon from "./icons/KeyboardIcon";
import PauseIcon from "./icons/PauseIcon";
import PlayIcon from "./icons/PlayIcon";
import ShrinkIcon from "./icons/ShrinkIcon";
import SpeakerOnIcon from "./icons/SpeakerOnIcon";
import SpeakerOffIcon from "./icons/SpeakerOffIcon";

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

function Gutter(props) {
  let fill;

  createEffect(() => {
    const duration = props.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const animation = fill.animate(
      [{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }],
      {
        duration: duration * 1000,
        easing: "linear",
        fill: "both",
      },
    );

    animation.pause();
    onCleanup(() => animation.cancel());

    createEffect(() => {
      const timing = props.timing;
      if (typeof timing?.time !== "number") return;

      if (timing.rate > 0) {
        animation.playbackRate = timing.rate;
        // Anchor to the document timeline, including time spent crossing the worker bridge.
        animation.startTime =
          timing.sampledAt - performance.timeOrigin - (timing.time * 1000) / timing.rate;
      } else {
        animation.pause();
        animation.currentTime = Math.max(0, Math.min(timing.time, duration)) * 1000;
      }
    });
  });

  return (
    <>
      <span class="ap-gutter ap-gutter-empty" />
      <span class="ap-gutter ap-gutter-clip">
        <span class="ap-gutter-full" ref={fill} />
      </span>
    </>
  );
}

export default (props) => {
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

  const calcPosition = (e) => {
    const barWidth = e.currentTarget.offsetWidth;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pos = Math.max(0, mouseX / barWidth);

    return `${pos * 100}%`;
  };

  const [mouseDown, setMouseDown] = createSignal(false);
  // eslint-disable-next-line solid/reactivity -- called from event handlers only, reads the prop at call time
  const throttledSeek = throttle((pos) => props.onSeekClick(pos), 50);

  const onMouseDown = (e) => {
    if (e._marker) return;
    if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey || e.button !== 0) return;

    setMouseDown(true);
    props.onSeekClick(calcPosition(e));
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
        <button
          class="ap-button ap-playback-button"
          onClick={(e) => {
            e.preventDefault();
            props.onPlayClick(e);
          }}
          type="button"
          aria-label={props.isPlaying ? "Pause" : "Play"}
        >
          <Switch>
            <Match when={props.isPlaying}>
              <PauseIcon />
            </Match>
            <Match when={true}>
              <PlayIcon />
            </Match>
          </Switch>
        </button>
      </Show>

      <span class="ap-timer">
        <span class="ap-time-elapsed">{currentTime()}</span>
        <span class="ap-time-remaining">{remainingTime()}</span>
      </span>

      <span class="ap-progressbar">
        <Show when={typeof props.duration === "number" || props.isSeekable}>
          <span class="ap-bar" onMouseDown={onMouseDown} onMouseMove={onMove}>
            <Gutter duration={props.duration} timing={props.timing} />
            <For each={markers()}>
              {(m, i) => (
                <span
                  class="ap-marker-container ap-tooltip-container"
                  style={{ left: markerPosition(m) }}
                  onClick={(e) => {
                    e.preventDefault();
                    props.onSeekClick({ marker: i() });
                  }}
                  onMouseDown={(e) => {
                    e._marker = true;
                  }}
                >
                  <span class="ap-marker" classList={{ "ap-marker-past": isPastMarker(m) }} />
                  <span class="ap-tooltip">{markerText(m)}</span>
                </span>
              )}
            </For>
          </span>
        </Show>
      </span>

      <Show when={props.isMuted !== undefined}>
        <button
          class="ap-button ap-speaker-button ap-tooltip-container"
          onClick={(e) => {
            e.preventDefault();
            props.onMuteClick(e);
          }}
          type="button"
          aria-label="Mute / unmute"
        >
          <Switch>
            <Match when={props.isMuted === true}>
              <SpeakerOffIcon />
              <span class="ap-tooltip">Unmute (m)</span>
            </Match>
            <Match when={props.isMuted === false}>
              <SpeakerOnIcon />
              <span class="ap-tooltip">Mute (m)</span>
            </Match>
          </Switch>
        </button>
      </Show>

      <button
        class="ap-button ap-kbd-button ap-tooltip-container"
        onClick={(e) => {
          e.preventDefault();
          props.onHelpClick(e);
        }}
        type="button"
        aria-label="Show keyboard shortcuts"
      >
        <KeyboardIcon />
        <span class="ap-tooltip">Keyboard shortcuts (?)</span>
      </button>

      <button
        class="ap-button ap-fullscreen-button ap-tooltip-container"
        onClick={(e) => {
          e.preventDefault();
          props.onFullscreenClick(e);
        }}
        type="button"
        aria-label="Toggle fullscreen mode"
      >
        <ShrinkIcon />
        <ExpandIcon />
        <span class="ap-tooltip">Fullscreen (f)</span>
      </button>
    </div>
  );
};
