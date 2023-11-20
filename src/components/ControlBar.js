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

export default props => {
  const e = (f) => { return e => { e.preventDefault(); f(e); } };

  const currentTime = () => typeof props.currentTime === 'number'
    ? formatTime(props.currentTime)
    : '--:--';

  const remainingTime = () => typeof props.remainingTime === 'number'
    ? '-' + formatTime(props.remainingTime)
    : currentTime();

  const markers = createMemo(() =>
    typeof props.duration === 'number'
    ? props.markers.filter(m => m[0] < props.duration)
    : []
  );

  const markerPosition = (m) => `${(m[0] / props.duration) * 100}%`;

  const markerTime = (m) => {
      return formatTime(m[0]);
  };

  const markerText = (m) => {
    return m[1];
  };

  const isPastMarker = (m) => typeof props.currentTime === 'number'
    ? m[0] <= props.currentTime
    : false;

  const gutterBarStyle = () => {
    return {
      width: "100%",
      transform: `scaleX(${(props.progress || 0)}`,
      "transform-origin": "left center"
    }
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

  const onClick = (e) => {
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

  const stopPropagation = e((e) => {
    e.stopPropagation();
  });

  document.addEventListener('mouseup', onDocumentMouseUp);

  onCleanup(() => {
    document.removeEventListener('mouseup', onDocumentMouseUp);
  });

  return (
    <div class="ap-control-bar" classList={{ 'ap-seekable': props.isSeekable }} ref={props.ref}>
      <Show when={props.isPausable}>
        <span class="ap-playback-button" onClick={e(props.onPlayClick)}>
          <Switch>
            <Match when={props.isPlaying}>
              <svg version="1.1" viewBox="0 0 12 12" class="ap-icon" aria-label="Pause" role="button" tabindex="0">
                <path d="M1,0 L4,0 L4,12 L1,12 Z"></path>
                <path d="M8,0 L11,0 L11,12 L8,12 Z"></path>
              </svg>
            </Match>
            <Match when={!props.isPlaying}>
              <svg version="1.1" viewBox="0 0 12 12" class="ap-icon" aria-label="Play" role="button" tabindex="0">
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

      <Show when={typeof props.progress === 'number' || props.isSeekable}>
        <span class="ap-progressbar">
          <span class="ap-bar" onMouseDown={onClick} onMouseMove={onMove}>
            <span class="ap-gutter">
              <span class="ap-gutter-fill" style={gutterBarStyle()}>
              </span>
            </span>
            <For each={markers()}>
              {(m, i) => <span class="ap-marker-container" style={{ left: markerPosition(m) }} onClick={seekToMarker(i())} onMouseDown={stopPropagation}><span class="ap-marker" classList={{ 'ap-marker-past': isPastMarker(m) }}></span><span class="ap-marker-tooltip"><span class="ap-marker-tooltip-text" style="font-size:12px" innerHTML={markerText(m)}></span><div class="ap-marker-tooltip-time-container"><span class="ap-marker-tooltip-time" style="font-size:12px">{markerTime(m)}</span></div></span></span>}
            </For>
          </span>
        </span>
      </Show>
      <span class="ap-search-button" onClick={e(props.onSearchClick)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M5.146 4.58173C5.146 4.18615 5.58362 3.94723 5.91638 4.16115L10.0671 6.82947C10.3732 7.02629 10.3732 7.47383 10.0671 7.67065L5.91638 10.339C5.58362 10.5529 5.146 10.314 5.146 9.91839V4.58173Z" stroke="white"/>
          <path d="M7.22217 13.4444C10.6586 13.4444 13.4443 10.6586 13.4443 7.22223C13.4443 3.78582 10.6586 1.00006 7.22217 1.00006C3.78576 1.00006 1 3.78582 1 7.22223C1 10.6586 3.78576 13.4444 7.22217 13.4444Z" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15 14.9999L11.6167 11.6166" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="ap-fullscreen-button" onClick={e(props.onFullscreenClick)} title="Toggle fullscreen mode" aria-label="Toggle Fullscreen" role="button" tabindex="0">
        <svg version="1.1" viewBox="0 0 12 12" class="ap-icon">
          <path d="M12,0 L7,0 L9,2 L7,4 L8,5 L10,3 L12,5 Z"></path>
          <path d="M0,12 L0,7 L2,9 L4,7 L5,8 L3,10 L5,12 Z"></path>
        </svg>
        <svg version="1.1" viewBox="0 0 12 12" class="ap-icon">
          <path d="M7,5 L7,0 L9,2 L11,0 L12,1 L10,3 L12,5 Z"></path>
          <path d="M5,7 L0,7 L2,9 L0,11 L1,12 L3,10 L5,12 Z"></path>
        </svg>
      </span>
    </div>
  );
}
