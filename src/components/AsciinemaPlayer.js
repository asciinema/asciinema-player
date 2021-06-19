import AsciinemaPlayerCore from '../core';
import { batch, createEffect, createMemo, createState, Match, onCleanup, onMount, reconcile, Switch } from 'solid-js';
import Terminal from './Terminal';
import ControlBar from './ControlBar';
import LoaderOverlay from './LoaderOverlay';
import StartOverlay from './StartOverlay';


export default props => {
  const [state, setState] = createState({
    state: 'initial',
    cols: props.cols,
    rows: props.rows,
    lines: [],
    cursor: undefined,
    charW: null,
    charH: null,
    bordersW: null,
    bordersH: null,
    containerW: null,
    containerH: null,
    showControls: false,
    currentTime: null,
    remainingTime: null,
    progress: null,
    blink: true,
    forceBlink: false
  });

  let frameRequestId;
  let userActivityTimeoutId;
  let timeUpdateIntervalId;
  let blinkIntervalId;

  let wrapperRef;
  let terminalRef;

  let resizeObserver;

  const terminalCols = () => state.cols || 80;
  const terminalRows = () => state.rows || 24;

  const core = AsciinemaPlayerCore.build(props.src, {
    cols: props.cols,
    rows: props.rows,
    loop: props.loop,
    speed: props.speed,

    onSize: (cols, rows) => {
      if (!state.cols) {
        setState({ cols, rows });
      }
    },

    onFinish: () => onFinish()
  });

  core.init();

  onMount(async () => {
    console.log('mounted!');

    if (props.preload) {
      await core.preload();
      updateTime();
    }

    setState({
      charW: terminalRef.clientWidth / terminalCols(),
      charH: terminalRef.clientHeight / terminalRows(),
      bordersW: terminalRef.offsetWidth - terminalRef.clientWidth,
      bordersH: terminalRef.offsetHeight - terminalRef.clientHeight,
      containerW: wrapperRef.offsetWidth,
      containerH: wrapperRef.offsetHeight
    });

    resizeObserver = new ResizeObserver(_entries => {
      console.log('container resized!')

      setState({
        containerW: wrapperRef.offsetWidth,
        containerH: wrapperRef.offsetHeight
      });
    });

    resizeObserver.observe(wrapperRef);

    if (props.autoplay) {
      play();
    }
  });

  onCleanup(() => {
    core.stop()
    stopTimeUpdates();
    cancelAnimationFrame(frameRequestId);
    stopBlinking();
    resizeObserver.disconnect();
  });

  createEffect(() => {
    state.cursor;  // <- accessing this subscribes this effect for cursor change
    setState('forceBlink', true);
  });

  const play = async () => {
    setState('state', 'loading');

    const timeoutId = setTimeout(() => {
      setState('state', 'waiting');
    }, 1000);

    await core.start();
    clearTimeout(timeoutId);
    setState('state', 'playing');
    frameRequestId = requestAnimationFrame(frame);
    startTimeUpdates();
    startBlinking();
  }

  const pauseOrResume = () => {
    if (state.state == 'initial') {
      play();
    } else {
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
  }

  const frame = () => {
    frameRequestId = requestAnimationFrame(frame);
    updateTerminal();
  }

  const updateTerminal = () => {
    const cursor = core.getCursor();
    const changedLines = core.getChangedLines();

    batch(() => {
      setState('cursor', reconcile(cursor));

      if (changedLines.size > 0) {
        changedLines.forEach((line, i) => {
          setState('lines', i, reconcile(line));
        });

        setState('forceBlink', true);
      }
    });
  }

  const terminalSize = createMemo(() => {
    console.log('terminalSize');

    if (!state.charW) {
      return {};
    }

    console.log(`containerW = ${state.containerW}`);

    const terminalW = (state.charW * terminalCols()) + state.bordersW;
    const terminalH = (state.charH * terminalRows()) + state.bordersH;

    if (props.size) {
      let priority = 'width';

      if (props.size == 'fitboth' || !!document.fullscreenElement) {
        const containerRatio = state.containerW / state.containerH;
        const terminalRatio = terminalW / terminalH;

        if (containerRatio > terminalRatio) {
          priority = 'height';
        }
      }

      if (priority == 'width') {
        const scale = state.containerW / terminalW;

        return {
          scale: scale,
          width: state.containerW,
          height: terminalH * scale
        };
      } else {
        const scale = state.containerH / terminalH;

        return {
          scale: scale,
          width: terminalW * scale,
          height: state.containerH
        };
      }
    } else {
      return {
        scale: 1,
        width: 200,
        height: 100
      };
    }
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.requestFullscreen();
    }
  }

  const onFinish = () => {
    console.log('finished');
    setState('state', 'paused');
    updateTime();
    stopTimeUpdates();
    stopBlinking();
  }

  const onKeyPress = (e) => {
    console.log(e);

    if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) {
      return;
    }

    if (e.key == ' ') {
      pauseOrResume();
    } else if (e.key == 'f') {
      toggleFullscreen();
    } else if (e.key == 'ArrowLeft') {
      seek('<<');
    } else if (e.key == 'ArrowRight') {
      seek('>>');
    } else if (e.key.charCodeAt(0) >= 48 && e.key.charCodeAt(0) <= 57) {
      const pos = (e.key.charCodeAt(0) - 48) / 10;
      seek(pos);
    } else {
      return;
    }

    e.preventDefault();
  }

  const seek = async pos => {
    if (await core.seek(pos)) {
      updateTime();
      updateTerminal();
    }
  }

  const startTimeUpdates = () => {
    timeUpdateIntervalId = setInterval(updateTime, 100);
  }

  const stopTimeUpdates = () => {
    clearInterval(timeUpdateIntervalId);
  }

  const updateTime = () => {
    const currentTime = core.getCurrentTime();
    const remainingTime = core.getRemainingTime();
    const progress = core.getProgress();

    setState({ currentTime, remainingTime, progress });
  }

  const startBlinking = () => {
    blinkIntervalId = setInterval(() => {
      setState(state => {
        const changes = { blink: !state.blink };

        if (changes.blink) {
          changes.forceBlink = false;
        }

        return changes;
      });
    }, 500);
  }

  const stopBlinking = () => {
    clearInterval(blinkIntervalId);
    setState('blink', true);
  }

  const showControls = (show) => {
    clearTimeout(userActivityTimeoutId);

    if (show) {
      userActivityTimeoutId = setTimeout(() => showControls(false), 2000);
    }

    setState('showControls', show);
  }

  const playerStyle = () => {
    const size = terminalSize();

    if (size.width) {
      return {
        width: `${size.width}px`,
        height: `${size.height}px`
      }
    } else {
      return {
        height: 0
      }
    }
  }

  const terminalScale = () => terminalSize().scale;

  return (
    <div class="asciinema-player-wrapper" classList={{ hud: state.showControls }} tabIndex="-1" onKeyPress={onKeyPress} ref={wrapperRef}>
      <div class="asciinema-player asciinema-theme-asciinema font-small" style={playerStyle()} onMouseEnter={() => showControls(true)} onMouseLeave={() => showControls(false)} onMouseMove={() => showControls(true)}>
        <Terminal cols={terminalCols()} rows={terminalRows()} scale={terminalScale()} blink={state.forceBlink || state.blink} lines={state.lines} cursor={state.cursor} ref={terminalRef} />
        <ControlBar currentTime={state.currentTime} remainingTime={state.remainingTime} progress={state.progress} isPlaying={state.state == 'playing'} isPausable={core.isPausable()} isSeekable={core.isSeekable()} onPlayClick={pauseOrResume} onFullscreenClick={toggleFullscreen} onSeekClick={seek} />
        <Switch>
          <Match when={state.state == 'initial'}><StartOverlay onClick={play} /></Match>
          <Match when={state.state == 'waiting'}><LoaderOverlay /></Match>
        </Switch>
      </div>
    </div>
  );
}
