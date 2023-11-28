import { batch, createMemo, createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { debounce } from "../util";
import Terminal from './Terminal';
import ControlBar from './ControlBar';
import ErrorOverlay from './ErrorOverlay';
import LoaderOverlay from './LoaderOverlay';
import OfflineOverlay from './OfflineOverlay';
import StartOverlay from './StartOverlay';

const CONTROL_BAR_HEIGHT = 32; // must match height of div.ap-control-bar in CSS

export default props => {
  const logger = props.logger;
  const core = props.core;
  const autoPlay = props.autoPlay;
  const externalWrapper = props.externalWrapper;

  const [state, setState] = createStore({
    coreState: 'stopped',
    lines: [],
    cursor: undefined,
    charW: props.charW,
    charH: props.charH,
    bordersW: props.bordersW,
    bordersH: props.bordersH,
    containerW: 0,
    containerH: 0,
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

  const [terminalSize, setTerminalSize] = createSignal({ cols: props.cols, rows: props.rows });
  const [duration, setDuration] = createSignal(undefined);
  const [markers, setMarkers] = createStore([]);
  const [userActive, setUserActive] = createSignal(false);

  const terminalCols = () =>
    terminalSize().cols || 80;

  const terminalRows = () =>
    terminalSize().rows || 24;

  const controlBarHeight = () =>
    props.controls === false ? 0 : CONTROL_BAR_HEIGHT;

  const controlsVisible = () =>
    props.controls === true || props.controls === 'auto' && userActive();

  let frameRequestId;
  let userActivityTimeoutId;
  let timeUpdateIntervalId;
  let blinkIntervalId;
  let wrapperRef;
  let playerRef;
  let terminalRef;
  let controlBarRef;
  let resizeObserver;

  function onPlaying() {
    updateTerminal();
    startBlinking();
    startTimeUpdates();
  }

  function onStopped() {
    stopBlinking();
    stopTimeUpdates();
    updateTime();
  }

  function resize(size_) {
    if (size_.rows < terminalSize().rows) {
      setState('lines', state.lines.slice(0, size_.rows));
    }

    setTerminalSize(size_);
  }

  function setPoster(poster) {
    if (poster !== undefined && !autoPlay) {
      setState({
        lines: poster.lines,
        cursor: poster.cursor
      });
    }
  }

  core.addEventListener('init', ({ cols, rows, duration, poster, markers }) => {
    resize({ cols, rows });
    setDuration(duration);
    setMarkers(markers);
    setPoster(poster);
  });

  if(externalWrapper) {
    externalWrapper.addEventListener('updateMarkers', ({markers}) => {
      setMarkers(markers);
      setState('lines', []);
      core.markers = markers;
      core.driver.setMarkers(markers);
    });
  }

  core.addEventListener('play', () => {
    setState('showStartOverlay', false);
  });

  core.addEventListener('playing', () => {
    setState('coreState', 'playing');
    onPlaying();
  });

  core.addEventListener('stopped', () => {
    setState('coreState', 'stopped');
    onStopped();
  });

  core.addEventListener('loading', () => {
    setState('coreState', 'loading');
    onStopped();
  });

  core.addEventListener('offline', () => {
    setState('coreState', 'offline');
    onStopped();
  });

  core.addEventListener('errored', () => {
    setState({ coreState: 'errored', showStartOverlay: false });
  });

  core.addEventListener('resize', resize);

  core.addEventListener('reset', size => {
    resize(size);
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

  const setupResizeObserver = () => {
    resizeObserver = new ResizeObserver(debounce(_entries => {
      setState({
        containerW: wrapperRef.offsetWidth,
        containerH: wrapperRef.offsetHeight
      });

      wrapperRef.dispatchEvent(new CustomEvent('resize', { detail: { el: playerRef } }));
    }, 10));

    resizeObserver.observe(wrapperRef);
  }

  onMount(async () => {
    logger.info('player mounted');
    logger.debug('font measurements', { charW: state.charW, charH: state.charH });
    setupResizeObserver();
    const { isPausable, isSeekable, poster } = await core.init();

    setState({
      isPausable,
      isSeekable,
      containerW: wrapperRef.offsetWidth,
      containerH: wrapperRef.offsetHeight
    });

    setPoster(poster);

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
      batch(() => {
        changedLines.forEach((line, i) => {
          setState('lines', i, reconcile(line));
        });
      });
    }

    setState('cursor', reconcile(core.getCursor()));
    setState('cursorHold', true);

    frameRequestId = undefined;
  }

  const terminalElementSize = createMemo(() => {
    logger.debug(`containerW = ${state.containerW}`);

    const terminalW = (state.charW * terminalCols()) + state.bordersW;
    const terminalH = (state.charH * terminalRows()) + state.bordersH;

    let fit = props.fit ?? 'width';

    if (fit === 'both' || state.isFullscreen) {
      const containerRatio = state.containerW / (state.containerH - controlBarHeight());
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
        height: terminalH * scale + controlBarHeight()
      };
    } else if (fit === 'height') {
      const scale = (state.containerH - controlBarHeight()) / terminalH;

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
        core.seek({ marker: 'prev' });
      } else if (e.key == 'ArrowRight') {
        core.seek({ marker: 'next' });
      } else {
        return;
      }

      e.preventDefault();

      return;
    }

    if (e.key == ' ') {
      core.togglePlay();
    } else if (e.key == '.') {
      core.step();
      updateTime();
    } else if (e.key == 'f') {
      toggleFullscreen();
    } else if (e.key == 'ArrowLeft') {
      core.seek({ marker: 'prev' });
      if (typeof updateArrowButtonsMode !== 'undefined') {
        updateArrowButtonsMode(core.getCurrentTime())
      }
    } else if (e.key == 'ArrowRight') {
      core.seek({ marker: 'next' });
      if (typeof updateArrowButtonsMode !== 'undefined') {
        updateArrowButtonsMode(core.getCurrentTime())
      }
    } else if (e.key == '[') {
      core.seek({ marker: 'prev' });
    } else if (e.key == ']') {
      core.seek({ marker: 'next' });
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
      onUserActive(true);
    }
  }

  const playerOnMouseLeave = () => {
    if (!state.isFullscreen) {
      onUserActive(false);
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

  const onUserActive = (show) => {
    clearTimeout(userActivityTimeoutId);

    if (show) {
      userActivityTimeoutId = setTimeout(() => onUserActive(false), 2000);
    }

    setUserActive(show);
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

    const size = terminalElementSize();

    if (size.width !== undefined) {
      style['width'] = `${size.width}px`;
      style['height'] = `${size.height}px`;
    }

    return style;
  }

  const playerClass = () =>
    `ap-player asciinema-theme-${props.theme ?? 'asciinema'}`;

  const terminalScale = () =>
    terminalElementSize()?.scale;

  const el = (
    <div class="ap-wrapper" classList={{ 'ap-hud': controlsVisible() }} tabIndex="-1" onKeyPress={onKeyPress} onKeyDown={onKeyPress} onMouseMove={wrapperOnMouseMove} onFullscreenChange={onFullscreenChange} onWebkitFullscreenChange={onFullscreenChange} ref={wrapperRef}>
      <div class={playerClass()} style={playerStyle()} onMouseLeave={playerOnMouseLeave} onMouseMove={() => onUserActive(true)} ref={playerRef}>
        <Terminal cols={terminalCols()} rows={terminalRows()} scale={terminalScale()} blink={state.blink} lines={state.lines} cursor={state.cursor} cursorHold={state.cursorHold} fontFamily={props.terminalFontFamily} lineHeight={props.terminalLineHeight} ref={terminalRef} searchTerm={core.getSearchTerm()}/>
        <Show when={props.controls !== false}>
          <div id="search-container" className="search-container" style="display: none;">
            <div className="inner-search-container">
            <span className="search-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z" stroke="#4F4F4F" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14.0001 14L11.1001 11.1" stroke="#4F4F4F" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
              <input className="search-text" onKeyUp="event.stopPropagation(); onSearchTextKeyUp(event, this)" onKeyPress="event.stopPropagation()" onKeyDown = "event.stopPropagation();"    />
              <span className="search-separator"></span>
              <span id="previousArrow" className="arrow arrow-enabled" onClick="previousMarker()">
              <span className="enabled-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="12" viewBox="0 0 8 12" fill="none">
                  <path d="M7 0.5L1 6L7 11.5" stroke="#000850" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span className="disabled-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="12" viewBox="0 0 8 12" fill="none">
                  <path d="M7 0.5L1 6L7 11.5" stroke="#B7B7B7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </span>
              <span id="nextArrow" className="arrow" onClick="nextMarker()">
              <span className="enabled-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="12" viewBox="0 0 8 12" fill="none">
                  <path d="M1 11.5L7 6L1 0.5" stroke="#000850" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span className="disabled-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="12" viewBox="0 0 8 12" fill="none">
                  <path d="M1 11.5L7 6L1 0.5" stroke="#B7B7B7" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
              </span>
            </span>
              <span className="clear-search" style="position: relative;width: 16px;height: 16px;" onClick="clearSearch()">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M8 16C12.4183 16 16 12.4183 16 8C16 3.58172 12.4183 0 8 0C3.58172 0 0 3.58172 0 8C0 12.4183 3.58172 16 8 16Z" fill="#B7B7B7"/>
              </svg>
              <span className="" style="position: absolute;left: 4px;top: -2px;width: 7px;height: 7px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M7.35355 0.646447L7 1L7 1L7.35355 0.646447ZM7.35355 1.35355L7 1V1L7.35355 1.35355ZM6.64645 0.646447L7 1L7 1L6.64645 0.646447ZM4 3.29289L3.64645 3.64645L4 4L4.35355 3.64645L4 3.29289ZM1.35355 0.646447L1.70711 0.292893V0.292893L1.35355 0.646447ZM0.646447 0.646447L1 1L1 1L0.646447 0.646447ZM0.646447 1.35355L0.292893 1.70711H0.292893L0.646447 1.35355ZM3.29289 4L3.64645 4.35355L4 4L3.64645 3.64645L3.29289 4ZM0.646447 6.64645L1 7L1 7L0.646447 6.64645ZM0.646447 7.35355L1 7L1 7L0.646447 7.35355ZM1.35355 7.35355L1 7H1L1.35355 7.35355ZM4 4.70711L4.35355 4.35355L4 4L3.64645 4.35355L4 4.70711ZM6.64645 7.35355L7 7L7 7L6.64645 7.35355ZM7.35355 7.35355L7 7L7 7L7.35355 7.35355ZM7.35355 6.64645L7 7L7 7L7.35355 6.64645ZM4.70711 4L4.35355 3.64645L4 4L4.35355 4.35355L4.70711 4ZM7 1V1L7.70711 1.70711C8.09763 1.31658 8.09763 0.683417 7.70711 0.292893L7 1ZM7 1H7L7.70711 0.292893C7.31658 -0.0976312 6.68342 -0.0976312 6.29289 0.292893L7 1ZM4.35355 3.64645L7 1L6.29289 0.292893L3.64645 2.93934L4.35355 3.64645ZM1 1L3.64645 3.64645L4.35355 2.93934L1.70711 0.292893L1 1ZM1 1V1L1.70711 0.292893C1.31658 -0.097631 0.683418 -0.0976311 0.292893 0.292893L1 1ZM1 1H1L0.292893 0.292893C-0.0976311 0.683418 -0.097631 1.31658 0.292893 1.70711L1 1ZM3.64645 3.64645L1 1L0.292893 1.70711L2.93934 4.35355L3.64645 3.64645ZM1 7L3.64645 4.35355L2.93934 3.64645L0.292893 6.29289L1 7ZM1 7V7L0.292893 6.29289C-0.0976312 6.68342 -0.0976312 7.31658 0.292893 7.70711L1 7ZM1 7H1L0.292893 7.70711C0.683417 8.09763 1.31658 8.09763 1.70711 7.70711L1 7ZM3.64645 4.35355L1 7L1.70711 7.70711L4.35355 5.06066L3.64645 4.35355ZM7 7L4.35355 4.35355L3.64645 5.06066L6.29289 7.70711L7 7ZM7 7H7L6.29289 7.70711C6.68342 8.09763 7.31658 8.09763 7.70711 7.70711L7 7ZM7 7V7L7.70711 7.70711C8.09763 7.31658 8.09763 6.68342 7.70711 6.29289L7 7ZM4.35355 4.35355L7 7L7.70711 6.29289L5.06066 3.64645L4.35355 4.35355ZM7 1L4.35355 3.64645L5.06066 4.35355L7.70711 1.70711L7 1Z" fill="white"/>
                  </svg>
              </span>
            </span>
            </div>

          </div>
          <ControlBar duration={duration()} currentTime={state.currentTime} remainingTime={state.remainingTime} progress={state.progress} markers={markers} isPlaying={state.coreState == 'playing'} isPausable={state.isPausable} isSeekable={state.isSeekable} onPlayClick={() => core.togglePlay()} onFullscreenClick={toggleFullscreen} onSeekClick={pos => core.seek(pos)} ref={controlBarRef}  onSearchClick={core.onSearchClick} />
        </Show>
        <Switch>
          <Match when={state.showStartOverlay}><StartOverlay onClick={() => core.play()} /></Match>
          <Match when={state.coreState == 'loading'}><LoaderOverlay /></Match>
          <Match when={state.coreState == 'offline'}><OfflineOverlay fontFamily={props.terminalFontFamily} /></Match>
          <Match when={state.coreState == 'errored'}><ErrorOverlay /></Match>
        </Switch>
      </div>
    </div>
  );

  return el;
}
