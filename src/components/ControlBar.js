import { Match, Switch, createSignal, onCleanup } from "solid-js";

function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  let time = '';
  if (m < 10) { time += '0' }
  time += `${m}:`;
  if (s < 10) { time += '0' }
  time += `${s}`;

  return time;
}

export default props => {
  const e = (f) => { return e => { e.preventDefault(); f(e); } };

  const currentTime = () => typeof props.currentTime === 'number'
    ? formatTime(props.currentTime)
    : '--:--';

  const remainingTime = () => typeof props.remainingTime === 'number'
    ? '-' + formatTime(props.remainingTime)
    : currentTime();

  const gutterBarStyle = () => {
    return {
      width: "100%",
      transform: `scaleX(${(props.progress || 0)}`,
      "transform-origin": "left center"
    }
  };

  const [mouseDown, setMouseDown] = createSignal(false);

  const onSeek = (e) => {
    if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) {
      return;
    }

    const barWidth = e.currentTarget.offsetWidth;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pos = Math.max(0, mouseX / barWidth);

    return props.onSeekClick(`${pos * 100}%`);
  };

  const onClick = (e) => {
    setMouseDown(true);
    onSeek(e);
  };

  const onMove = (e) => {
    if (mouseDown()) {
      onSeek(e);
    }
  };

  const onDocumentMouseUp = () => {
    setMouseDown(false);
  };

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
              <svg version="1.1" viewBox="0 0 12 12" class="ap-icon">
                <path d="M1,0 L4,0 L4,12 L1,12 Z"></path>
                <path d="M8,0 L11,0 L11,12 L8,12 Z"></path>
              </svg>
            </Match>
            <Match when={!props.isPlaying}>
              <svg version="1.1" viewBox="0 0 12 12" class="ap-icon">
                <path d="M1,0 L11,6 L1,12 Z"></path>
              </svg>
            </Match>
          </Switch>
        </span>
      </Show>

      <span class="ap-timer">
        <span class="ap-time-elapsed">{currentTime()}</span>
        <span class="ap-time-remaining">{remainingTime()}</span>
      </span>

      <span class="ap-fullscreen-button" onClick={e(props.onFullscreenClick)} title="Toggle fullscreen mode">
        <svg version="1.1" viewBox="0 0 12 12" class="ap-icon">
          <path d="M12,0 L7,0 L9,2 L7,4 L8,5 L10,3 L12,5 Z"></path>
          <path d="M0,12 L0,7 L2,9 L4,7 L5,8 L3,10 L5,12 Z"></path>
        </svg>
        <svg version="1.1" viewBox="0 0 12 12" class="ap-icon">
          <path d="M7,5 L7,0 L9,2 L11,0 L12,1 L10,3 L12,5 Z"></path>
          <path d="M5,7 L0,7 L2,9 L0,11 L1,12 L3,10 L5,12 Z"></path>
        </svg>
      </span>

      <Show when={typeof props.progress === 'number' || props.isSeekable}>
        <span class="ap-progressbar">
          <span class="ap-bar" onMouseDown={onClick} onMouseMove={onMove}>
            <span class="ap-gutter">
              <span style={gutterBarStyle()}>
              </span>
            </span>
          </span>
        </span>
      </Show>
    </div>
  );
}
