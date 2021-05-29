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

  let wrapperRef;
  let terminalRef;
  let charW;
  let charH;
  let bordersW;
  let bordersH;

  const core = AsciinemaPlayerCore.build(props.src, {
    loop: props.loop || false,
    cols: props.cols,
    rows: props.rows
  }, () => onFinish());

  onMount(() => {
    console.log('mounted!');

    charW = terminalRef.clientWidth / (state.width || 80);
    charH = terminalRef.clientHeight / (state.height || 24);
    bordersW = terminalRef.offsetWidth - terminalRef.clientWidth;
    bordersH = terminalRef.offsetHeight - terminalRef.clientHeight;

    resize();
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
      resize(); // make this reactive - createEffect ?
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

  const resize = () => {
    const container = wrapperRef;

    console.log(container);
    console.log('resizing terminal');

    const maxTerminalW = container.offsetWidth;
    console.log(`maxTerminalW = ${maxTerminalW}`);

    const newTerminalW = (charW * (state.width || 80)) + bordersW;
    const newTerminalH = (charH * (state.height || 24)) + bordersH;
    const isFullscreen = !!document.fullscreenElement;

    if (props.size == 'fitboth' || isFullscreen) {
      const containerRatio = container.offsetWidth / container.offsetHeight;
      const terminalRatio = newTerminalW / newTerminalH;

      if (containerRatio < terminalRatio) {
        const scale = maxTerminalW / newTerminalW;

        setState({
          terminalScale: scale,
          tw: maxTerminalW,
          th: newTerminalH * scale
        });
      } else {
        const scale = container.offsetHeight / newTerminalH;

        setState({
          terminalScale: scale,
          tw: newTerminalW * scale,
          th: container.offsetHeight
        });
      }
    } else if (props.size == 'fit') {
      const scale = maxTerminalW / newTerminalW;
      console.log(scale);

      setState({
        terminalScale: scale,
        tw: maxTerminalW,
        th: newTerminalH * scale
      });
    } else {
      setState({
        terminalScale: 1,
        tw: 200,
        th: 100
      });
    }
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
        width: `${state.tw}px`,
        height: `${state.th}px`
      }
    } else {
      return {
        height: 0
      }
    }
  }

  // TODO visibility: hidden until loaded/resized
  return (
    <div class="asciinema-player-wrapper" classList={{ hud: state.showControls }} tabIndex="-1" onKeyPress={onKeyPress} ref={wrapperRef}>
      <div class="asciinema-player asciinema-theme-asciinema font-small" style={playerStyle()} onMouseEnter={() => showControls(true)} onMouseLeave={() => showControls(false)} onMouseMove={() => showControls(true)}>
        <Terminal width={state.width || 80} height={state.height || 24} scale={state.terminalScale} blink={state.blink} lines={state.lines} cursor={state.cursor} ref={terminalRef} />
        <ControlBar currentTime={state.currentTime} remainingTime={state.remainingTime} progress={state.progress} isPlaying={state.state == 'playing'} isPausable={core.isPausable()} isSeekable={core.isSeekable()} onPlayClick={pauseOrResume} onFullscreenClick={toggleFullscreen} />
        <Switch>
          <Match when={state.state == 'initial'}><StartOverlay onClick={play} /></Match>
          <Match when={state.state == 'waiting'}><LoaderOverlay /></Match>
        </Switch>
      </div>
    </div>
  );
}
