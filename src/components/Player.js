import { createEffect, createMemo, Match, onCleanup, onMount, Switch } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { debounce } from "../util";
import Terminal from './Terminal';
import ControlBar from './ControlBar';
import LoaderOverlay from './LoaderOverlay';
import StartOverlay from './StartOverlay';


export default props => {
  const logger = props.logger;
  const core = props.core;
  const autoPlay = props.autoPlay;

  const [state, setState] = createStore({
    coreState: 'stopped',
    cols: props.cols,
    rows: props.rows,
    lines: [],
    cursor: undefined,
    charW: null,
    charH: null,
    bordersW: null,
    bordersH: null,
    controlBarH: null,
    containerW: null,
    containerH: null,
    showControls: false,
    showStartOverlay: !autoPlay,
    isPausable: true,
    isSeekable: true,
    isFullscreen: false,
    currentTime: null,
    remainingTime: null,
    progress: null,
    blink: true,
    cursorHold: false
  });

  const terminalCols = () => state.cols || 80;
  const terminalRows = () => state.rows || 24;

  let frameRequestId;
  let userActivityTimeoutId;
  let timeUpdateIntervalId;
  let blinkIntervalId;
  let wrapperRef;
  let playerRef;
  let terminalRef;
  let controlBarRef;
  let resizeObserver;

  core.addEventListener('stateChanged', ({ newState, data }) => {
    setState('coreState', newState);

    if (newState === 'playing') {
      setState('showStartOverlay', false);
      updateTerminal();
      startBlinking();
      startTimeUpdates();
    } else {
      stopBlinking();
      stopTimeUpdates();
      updateTime();
    }
  });

  core.addEventListener('reset', ({ cols, rows }) => {
    if (rows < state.rows) {
      setState('lines', state.lines.slice(0, rows));
    }

    setState({ cols, rows });
    updateTerminal();
  });

  core.addEventListener('seeked', () => {
    updateTime();
  });

  core.addEventListener('terminalUpdate', () => {
    if (frameRequestId === undefined) {
      frameRequestId = requestAnimationFrame(updateTerminal);
    }
  });

  const measureDomElements = () => {
    setState({
      charW: terminalRef.clientWidth / terminalCols(),
      charH: terminalRef.clientHeight / terminalRows(),
      bordersW: terminalRef.offsetWidth - terminalRef.clientWidth,
      bordersH: terminalRef.offsetHeight - terminalRef.clientHeight,
      controlBarH: controlBarRef.offsetHeight,
      containerW: wrapperRef.offsetWidth,
      containerH: wrapperRef.offsetHeight
    });
  }

  const setupResizeObserver = () => {
    resizeObserver = new ResizeObserver(debounce(_entries => {
      setState({
        containerW: wrapperRef.offsetWidth,
        containerH: wrapperRef.offsetHeight
      });

      wrapperRef.dispatchEvent(new CustomEvent('resize', {detail: {el: playerRef}}));
    }, 10));

    resizeObserver.observe(wrapperRef);
  }

  onMount(async () => {
    logger.info('player mounted');
    measureDomElements();
    logger.debug('font measurements', { charW: state.charW, charH: state.charH });
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
      core.play();
    }
  });

  onCleanup(() => {
    core.stop()
    stopBlinking();
    stopTimeUpdates();
    resizeObserver.disconnect();
  });

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

    logger.debug(`containerW = ${state.containerW}`);

    const terminalW = (state.charW * terminalCols()) + state.bordersW;
    const terminalH = (state.charH * terminalRows()) + state.bordersH;

    let fit = props.fit ?? 'width';

    if (fit === 'both' || state.isFullscreen) {
      const containerRatio = state.containerW / (state.containerH - state.controlBarH);
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
        height: terminalH * scale + state.controlBarH
      };
    } else if (fit === 'height') {
      const scale = (state.containerH - state.controlBarH) / terminalH;

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

  const togglePlay = () => {
    if (state.coreState === 'playing') {
      core.pause();
    } else if (state.coreState === 'stopped') {
      core.play();
    }
  }

  const onKeyPress = (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) {
      return;
    }

    if (e.shiftKey) {
      if (e.key == 'ArrowLeft') {
        core.seek('<<<');
      } else if (e.key == 'ArrowRight') {
        core.seek('>>>');
      } else {
        return;
      }

      e.preventDefault();

      return;
    }

    if (e.key == ' ') {
      togglePlay();
    } else if (e.key == '.') {
      core.step();
      updateTime();
    } else if (e.key == 'f') {
      toggleFullscreen();
    } else if (e.key == 'ArrowLeft') {
      core.seek('<<');
    } else if (e.key == 'ArrowRight') {
      core.seek('>>');
    } else if (e.key.charCodeAt(0) >= 48 && e.key.charCodeAt(0) <= 57) {
      const pos = (e.key.charCodeAt(0) - 48) / 10;
      core.seek(`${pos * 100}%`);
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

    if ((props.fit === false || props.fit === 'none') && props.terminalFontSize !== undefined) {
      if (props.terminalFontSize === 'small') {
        style['font-size'] = '12px';
      } else if (props.terminalFontSize === 'medium') {
        style['font-size'] = '18px';
      } else if (props.terminalFontSize === 'big') {
        style['font-size'] = '24px';
      } else {
        style['font-size'] = props.terminalFontSize;
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

  const el = (
    <div class="asciinema-player-wrapper" classList={{ hud: state.showControls }} tabIndex="-1" onKeyPress={onKeyPress} onKeyDown={onKeyPress} onMouseMove={wrapperOnMouseMove} onFullscreenChange={onFullscreenChange} onWebkitFullscreenChange={onFullscreenChange} ref={wrapperRef}>
      <div class={playerClass()} style={playerStyle()} onMouseLeave={playerOnMouseLeave} onMouseMove={() => showControls(true)} ref={playerRef}>
        <Terminal cols={terminalCols()} rows={terminalRows()} scale={terminalScale()} blink={state.blink} lines={state.lines} cursor={state.cursor} cursorHold={state.cursorHold} fontFamily={props.terminalFontFamily} lineHeight={props.terminalLineHeight} ref={terminalRef} />
        <ControlBar currentTime={state.currentTime} remainingTime={state.remainingTime} progress={state.progress} isPlaying={state.coreState == 'playing'} isPausable={state.isPausable} isSeekable={state.isSeekable} onPlayClick={() => togglePlay()} onFullscreenClick={toggleFullscreen} onSeekClick={pos => core.seek(pos)} ref={controlBarRef} />
        <Switch>
          <Match when={state.showStartOverlay}><StartOverlay onClick={() => core.play()} /></Match>
          <Match when={state.coreState == 'loading'}><LoaderOverlay /></Match>
        </Switch>
      </div>
    </div>
  );

  return el;
}
