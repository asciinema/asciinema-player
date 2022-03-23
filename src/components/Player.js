import { createEffect, createMemo, Match, onCleanup, onMount, Switch } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import Core from '../core';
import Terminal from './Terminal';
import ControlBar from './ControlBar';
import LoaderOverlay from './LoaderOverlay';
import StartOverlay from './StartOverlay';
import Keystrokes from './Keystrokes';


export default props => {
  const [state, setState] = createStore({
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
    isPausable: true,
    isSeekable: true,
    isFullscreen: false,
    currentTime: null,
    remainingTime: null,
    progress: null,
    blink: true,
    cursorHold: false,
    keystrokes: []
  });

  const autoPlay = props.autoPlay ?? props.autoplay;
  const keystrokesTTL = props.keystrokesTTL/1000 || 3.0;

  let frameRequestId;
  let userActivityTimeoutId;
  let timeUpdateIntervalId;
  let blinkIntervalId;

  let wrapperRef;
  let playerRef;
  let terminalRef;

  let resizeObserver;

  const terminalCols = () => state.cols || 80;
  const terminalRows = () => state.rows || 24;

  const core = new Core(props.driverFn, {
    cols: props.cols,
    rows: props.rows,
    loop: props.loop,
    speed: props.speed,
    preload: props.preload,
    startAt: props.startAt,
    poster: props.poster,
    idleTimeLimit: props.idleTimeLimit,

    onSize: (cols, rows) => {
      if (rows < state.rows) {
        setState('lines', state.lines.slice(0, rows));
      }

      setState({ cols, rows });
    },

    onFeed: now => {
      // remove stale keystrokes
      if (now === undefined) {
        now = state.currentTime;
      }
      setState('keystrokes', keys => {
        while ((keys.length > 0) && (keys[0][0] + keystrokesTTL < now)) {
          keys.shift();
        }
        return keys;
      });
    },
    onTerminalUpdate: () => {
      if (frameRequestId === undefined) {
        frameRequestId = requestAnimationFrame(updateTerminal);
      }
    },

    onKeysUpdate: (data, now) => {
      if (now === undefined) {
        now = state.currentTime;
      }
      if (data == '\x1bc') {
          setState('keystrokes', []);
          return;
      }
      let d = data.replaceAll('\r', '&crarr;').replaceAll('\t', '&#x2409;')
          .replaceAll('\x1b[A', '&uarr;') .replaceAll('\x1b[B', '&darr;')
          .replaceAll('\x1b[C', '&rarr;').replaceAll('\x1b[D', '&larr;')
          .replaceAll('\x1b', '^[');
      setState('keystrokes', state.keystrokes.concat([[now, d]]));
    },
    onFinish: () => {
      setState('state', 'paused');
    }
  });

  const measureDomElements = () => {
    setState({
      charW: terminalRef.clientWidth / terminalCols(),
      charH: terminalRef.clientHeight / terminalRows(),
      bordersW: terminalRef.offsetWidth - terminalRef.clientWidth,
      bordersH: terminalRef.offsetHeight - terminalRef.clientHeight,
      containerW: wrapperRef.offsetWidth,
      containerH: wrapperRef.offsetHeight
    });
  }

  const setupResizeObserver = () => {
    resizeObserver = new ResizeObserver(_entries => {
      setState({
        containerW: wrapperRef.offsetWidth,
        containerH: wrapperRef.offsetHeight
      });

      wrapperRef.dispatchEvent(new CustomEvent('resize', {detail: {el: playerRef}}));
    });

    resizeObserver.observe(wrapperRef);
  }

  onMount(async () => {
    console.debug('player mounted');

    measureDomElements();
    setupResizeObserver();

    const { isPausable, isSeekable, poster } = await core.init();

    setState({ isPausable, isSeekable });

    if (poster !== undefined && !autoPlay) {
      setState({
        lines: poster.lines,
        cursor: poster.cursor
      });
    }

    if (autoPlay) {
      play();
    }
  });

  onCleanup(() => {
    core.stop()
    stopBlinking();
    stopTimeUpdates();
    resizeObserver.disconnect();
  });

  createEffect(() => {
    const s = state.state;

    if (s === 'playing') {
      startBlinking();
      startTimeUpdates();
    } else if (s === 'paused') {
      stopBlinking();
      stopTimeUpdates();
      updateTime();
    }
  });

  const play = async () => {
    setState('state', 'loading');

    const timeoutId = setTimeout(() => {
      setState('state', 'waiting');
    }, 1000);

    await core.play();
    clearTimeout(timeoutId);
    setState('state', 'playing');
  }

  const pauseOrResume = async () => {
    const isPlaying = await core.pauseOrResume();
    setState('state', isPlaying ? 'playing' : 'paused');
  }

  const seek = async pos => {
    if (await core.seek(pos)) {
      updateTime();
    }
  }

  const updateTerminal = () => {
    const changedLines = core.getChangedLines();

    if (changedLines) {
      changedLines.forEach((line, i) => {
        setState('lines', i, reconcile(line));
      });
    }

    setState('cursor', reconcile(core.getCursor()));
    setState('cursorHold', true);

    frameRequestId = undefined;
  }

  const terminalSize = createMemo(() => {
    if (!state.charW) {
      return;
    }

    console.debug(`containerW = ${state.containerW}`);

    const terminalW = (state.charW * terminalCols()) + state.bordersW;
    const terminalH = (state.charH * terminalRows()) + state.bordersH;

    let fit = props.fit ?? 'width';

    if (fit === 'both' || state.isFullscreen) {
      const containerRatio = state.containerW / state.containerH;
      const terminalRatio = terminalW / terminalH;

      if (containerRatio > terminalRatio) {
        fit = 'height';
      } else {
        fit = 'width';
      }
    }

    if (fit === false || fit === 'none') {
      return {};
    } else if (fit === 'width') {
      const scale = state.containerW / terminalW;

      return {
        scale: scale,
        width: state.containerW,
        height: terminalH * scale
      };
    } else if (fit === 'height') {
      const scale = state.containerH / terminalH;

      return {
        scale: scale,
        width: terminalW * scale,
        height: state.containerH
      };
    } else {
      throw `unsupported fit mode: ${fit}`;
    }
  });

  const onFullscreenChange = () => {
    setState('isFullscreen', document.fullscreenElement ?? document.webkitFullscreenElement);
  }

  const toggleFullscreen = () => {
    if (state.isFullscreen) {
      (document.exitFullscreen ??
       document.webkitExitFullscreen ??
       (() => {})).apply(document);
    } else {
      (wrapperRef.requestFullscreen ??
       wrapperRef.webkitRequestFullscreen ??
       (() => {})).apply(wrapperRef);
    }
  }

  const onKeyPress = (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) {
      return;
    }

    if (e.shiftKey) {
      if (e.key == 'ArrowLeft') {
        seek('<<<');
      } else if (e.key == 'ArrowRight') {
        seek('>>>');
      } else {
        return;
      }

      e.preventDefault();

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
      seek(`${pos * 100}%`);
    } else {
      return;
    }

    e.preventDefault();
  }

  const wrapperOnMouseMove = () => {
    if (state.isFullscreen) {
      showControls(true);
    }
  }

  const playerOnMouseLeave = () => {
    if (!state.isFullscreen) {
      showControls(false);
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
          changes.cursorHold = false;
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
    const style = {};

    if ((props.fit === false || props.fit === 'none') && props.fontSize !== undefined) {
      if (props.fontSize === 'small') {
        style['font-size'] = '12px';
      } else if (props.fontSize === 'medium') {
        style['font-size'] = '18px';
      } else if (props.fontSize === 'big') {
        style['font-size'] = '24px';
      } else {
        style['font-size'] = props.fontSize;
      }
    }

    const size = terminalSize();

    if (size === undefined) {
      style['height'] = 0;
      return style;
    }

    if (size.width !== undefined) {
      style['width'] = `${size.width}px`;
      style['height'] = `${size.height}px`;
    }

    return style;
  }

  const playerClass = () =>
    `asciinema-player asciinema-theme-${props.theme ?? 'asciinema'}`;

  const terminalScale = () => terminalSize()?.scale;

  return (
    <div class="asciinema-player-wrapper" classList={{ hud: state.showControls }} tabIndex="-1" onKeyPress={onKeyPress} onKeyDown={onKeyPress} onMouseMove={wrapperOnMouseMove} onFullscreenChange={onFullscreenChange} onWebkitFullscreenChange={onFullscreenChange} ref={wrapperRef}>
      <div class={playerClass()} style={playerStyle()} onMouseLeave={playerOnMouseLeave} onMouseMove={() => showControls(true)} ref={playerRef}>
        <Terminal cols={terminalCols()} rows={terminalRows()} scale={terminalScale()} blink={state.blink} lines={state.lines} cursor={state.cursor} cursorHold={state.cursorHold} ref={terminalRef} />
        <ControlBar currentTime={state.currentTime} remainingTime={state.remainingTime} progress={state.progress} isPlaying={state.state == 'playing'} isPausable={state.isPausable} isSeekable={state.isSeekable} onPlayClick={pauseOrResume} onFullscreenClick={toggleFullscreen} onSeekClick={seek} />
        <Show when={state.keystrokes.length > 0}>
          <Keystrokes keystrokes={state.keystrokes} />
        </Show>
        <Switch>
          <Match when={state.state == 'initial' && !autoPlay}><StartOverlay onClick={play} /></Match>
          <Match when={state.state == 'waiting'}><LoaderOverlay /></Match>
        </Switch>
      </div>
    </div>
  );
}
