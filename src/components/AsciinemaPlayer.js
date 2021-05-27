import AsciinemaPlayerCore from '../core';
import { batch, createState, Match, onCleanup, onMount, reconcile, Switch } from 'solid-js';
import Terminal from './Terminal';
import ControlBar from './ControlBar';
import LoaderOverlay from './LoaderOverlay';
import StartOverlay from './StartOverlay';


export default props => {
  const [state, setState] = createState({
    state: 'initial',
    width: props.cols,
    height: props.rows,
    duration: null,
    lines: [],
    cursor: undefined,
    terminalScale: 1.0,
    showControls: false,
    currentTime: null,
    remainingTime: null,
    progress: null,
    blink: true
  });

  let frameRequestId;
  let userActivityTimeoutId;
  let timeUpdateIntervalId;
  let blinkIntervalId;

  const core = AsciinemaPlayerCore.build(props.src, {
    loop: props.loop || false,
    cols: props.cols,
    rows: props.rows
  }, () => onFinish());

  onMount(() => {
    console.log('mounted!');
  });

  onCleanup(() => {
    core.stop()
    stopTimeUpdates();
    cancelAnimationFrame(frameRequestId);
    stopBlinking();
  });

  const play = async () => {
    setState('state', 'loading');

    const timeoutId = setTimeout(() => {
      setState('state', 'waiting');
    }, 1000);

    const { width, height, duration } = await core.start();
    clearTimeout(timeoutId);
    setState('state', 'playing');

    if (state.width) {
      setState('duration', duration);
    } else {
      setState({ duration: duration, width: width, height: height });
      // TODO resize();
    }

    frameRequestId = requestAnimationFrame(frame);

    startTimeUpdates();
    startBlinking();
  }

  const pauseOrResume = () => {
    const isPlaying = core.pauseOrResume();

    if (isPlaying) {
      setState('state', 'playing');
      startTimeUpdates();
      startBlinking();
    } else {
      setState('state', 'paused');
      updateTime();
      stopTimeUpdates();
      stopBlinking();
    }
  }

  const frame = () => {
    frameRequestId = requestAnimationFrame(frame);

    const cursor = core.getCursor();
    const changedLines = core.getChangedLines();

    batch(() => {
      setState('cursor', reconcile(cursor));

      if (changedLines.size > 0) {
        changedLines.forEach((line, i) => {
          setState('lines', i, reconcile(line));
        })
      }
    });
  }

  const toggleFullscreen = () => {
    // TODO
  }

  const onFinish = () => {
    console.log('finished');
    setState('state', 'paused');
    updateTime();
    stopTimeUpdates();
    stopBlinking();
  }

  const onKeyPress = (e) => {
    // TODO
  }

  const startTimeUpdates = () => {
    timeUpdateIntervalId = setInterval(() => {updateTime()}, 100);
  }

  const stopTimeUpdates = () => {
    clearInterval(timeUpdateIntervalId);
  }

  const updateTime = () => {
    let t = core.getCurrentTime();
    let r = core.getRemainingTime();
    let p = core.getProgress();

    setState({ currentTime: t, remainingTime: r, progress: p});
  }

  const startBlinking = () => {
    blinkIntervalId = setInterval(() => {
      setState('blink', blink => !blink);
    }, 500);
  }

  const stopBlinking = () => {
    clearInterval(blinkIntervalId);
    setState('blink', true);
  }

  const showControls = (show) => {
    if (show) {
      clearTimeout(userActivityTimeoutId);
      setState('showControls', true);
      userActivityTimeoutId = setTimeout(() => showControls(false), 2000);
    } else {
      clearTimeout(userActivityTimeoutId);
      setState('showControls', false);
    }
  }

  const playerStyle = () => {
    if (state.tw) {
      return {
        width: state.tw,
        height: state.th
      }
    } else {
      return {
        // height: 0
      }
    }
  }

  const e = (f) => { return e => { e.preventDefault(); f(e); } };

  // TODO visibility: hidden until loaded/resized
  return (
    <div class="asciinema-player-wrapper" classList={{ hud: state.showControls }} tabIndex="-1" xref={'this.wrapperRef'} onKeyPress={onKeyPress}>
      <div class="asciinema-player asciinema-theme-asciinema font-small" style={playerStyle()} xref={'this.playerRef'} onMouseEnter={e(() => showControls(true))} onMouseLeave={e(() => showControls(false))} onMouseMove={e(() => showControls(true))}>
        <Terminal width={state.width} height={state.height} scale={state.terminalScale} blink={state.blink} lines={state.lines} cursor={state.cursor} />
        <ControlBar currentTime={state.currentTime} remainingTime={state.remainingTime} progress={state.progress} isPlaying={state.state == 'playing'} isPausable={core.isPausable()} isSeekable={core.isSeekable()} onPlayClick={pauseOrResume} onFullscreenClick={toggleFullscreen} />
        <Switch>
          <Match when={state.state == 'initial'}><StartOverlay onClick={play} /></Match>
          <Match when={state.state == 'waiting'}><LoaderOverlay /></Match>
        </Switch>
      </div>
    </div>
  );
}
