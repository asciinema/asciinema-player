import { batch, createMemo, createSignal, Match, onCleanup, onMount, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Transition } from "solid-transition-group";
import { debounce } from "../util";
import Terminal from "./Terminal";
import ControlBar from "./ControlBar";
import ErrorOverlay from "./ErrorOverlay";
import LoaderOverlay from "./LoaderOverlay";
import InfoOverlay from "./InfoOverlay";
import StartOverlay from "./StartOverlay";
import HelpOverlay from "./HelpOverlay";

const CONTROL_BAR_HEIGHT = 32; // must match height of div.ap-control-bar in CSS

export default (props) => {
  const logger = props.logger;
  const core = props.core;
  const autoPlay = props.autoPlay;
  const charW = props.charW;
  const charH = props.charH;
  const bordersW = props.bordersW;
  const bordersH = props.bordersH;

  const [state, setState] = createStore({
    containerW: 0,
    containerH: 0,
    isPausable: true,
    isSeekable: true,
    isFullscreen: false,
    currentTime: null,
    remainingTime: null,
    progress: null,
  });

  const [isPlaying, setIsPlaying] = createSignal(false);
  const [isMuted, setIsMuted] = createSignal(undefined);
  const [wasPlaying, setWasPlaying] = createSignal(false);
  const [overlay, setOverlay] = createSignal(!autoPlay ? "start" : null);
  const [infoMessage, setInfoMessage] = createSignal(null);
  const [blinking, setBlinking] = createSignal(false);

  const [terminalSize, setTerminalSize] = createSignal(
    { cols: props.cols, rows: props.rows },
    { equals: (newVal, oldVal) => newVal.cols === oldVal.cols && newVal.rows === oldVal.rows },
  );

  const [duration, setDuration] = createSignal(null);
  const [markers, setMarkers] = createStore([]);
  const [userActive, setUserActive] = createSignal(false);
  const [isHelpVisible, setIsHelpVisible] = createSignal(false);
  const [originalTheme, setOriginalTheme] = createSignal(null);
  const terminalCols = createMemo(() => terminalSize().cols || 80);
  const terminalRows = createMemo(() => terminalSize().rows || 24);
  const controlBarHeight = () => (props.controls === false ? 0 : CONTROL_BAR_HEIGHT);

  const controlsVisible = () =>
    props.controls === true || (props.controls === "auto" && userActive());

  let userActivityTimeoutId;
  let timeUpdateIntervalId;
  let wrapperRef;
  let playerRef;
  let controlBarRef;
  let resizeObserver;

  function onPlaying() {
    setBlinking(true);
    startTimeUpdates();
  }

  function onStopped() {
    setBlinking(false);
    stopTimeUpdates();
    updateTime();
  }

  let resolveCoreReady;

  const coreReady = new Promise((resolve) => {
    resolveCoreReady = resolve;
  });

  core.addEventListener("ready", ({ isPausable, isSeekable }) => {
    setState({ isPausable, isSeekable });
    resolveCoreReady();
  });

  core.addEventListener("metadata", (meta) => {
    batch(() => {
      if (meta.duration !== undefined) {
        setDuration(meta.duration);
      }

      if (meta.markers !== undefined) {
        setMarkers(meta.markers);
      }

      if (meta.hasAudio !== undefined) {
        setIsMuted(meta.hasAudio ? false : undefined);
      }

      if (meta.size !== undefined) {
        setTerminalSize(meta.size);
      }

      if (meta.theme !== undefined) {
        setOriginalTheme(meta.theme);
      }
    });
  });

  core.addEventListener("play", () => {
    setOverlay(null);
  });

  core.addEventListener("playing", () => {
    batch(() => {
      setIsPlaying(true);
      setWasPlaying(true);
      setOverlay(null);
      onPlaying();
    });
  });

  core.addEventListener("idle", () => {
    batch(() => {
      setIsPlaying(false);
      onStopped();
    });
  });

  core.addEventListener("loading", () => {
    batch(() => {
      setIsPlaying(false);
      onStopped();
      setOverlay("loader");
    });
  });

  core.addEventListener("offline", ({ message }) => {
    batch(() => {
      setIsPlaying(false);
      onStopped();

      if (message !== undefined) {
        setInfoMessage(message);
        setOverlay("info");
      }
    });
  });

  core.addEventListener("muted", (muted) => {
    setIsMuted(muted);
  });

  const stats = { terminal: { renders: 0 } };

  core.addEventListener("ended", ({ message }) => {
    batch(() => {
      setIsPlaying(false);
      onStopped();

      if (message !== undefined) {
        setInfoMessage(message);
        setOverlay("info");
      }
    });

    logger.debug("stats", stats);
  });

  core.addEventListener("errored", () => {
    setOverlay("error");
  });

  core.addEventListener("seeked", () => {
    updateTime();
  });

  const setupResizeObserver = () => {
    resizeObserver = new ResizeObserver(
      debounce((_entries) => {
        setState({
          containerW: wrapperRef.offsetWidth,
          containerH: wrapperRef.offsetHeight,
        });

        wrapperRef.dispatchEvent(new CustomEvent("resize", { detail: { el: playerRef } }));
      }, 10),
    );

    resizeObserver.observe(wrapperRef);
  };

  onMount(async () => {
    logger.info("view: mounted");
    logger.debug("view: font measurements", { charW, charH });
    setupResizeObserver();

    setState({
      containerW: wrapperRef.offsetWidth,
      containerH: wrapperRef.offsetHeight,
    });
  });

  onCleanup(() => {
    core.stop();
    stopTimeUpdates();
    resizeObserver.disconnect();
  });

  const terminalElementSize = createMemo(() => {
    const terminalW = charW * terminalCols() + bordersW;
    const terminalH = charH * terminalRows() + bordersH;

    let fit = props.fit ?? "width";

    if (fit === "both" || state.isFullscreen) {
      const containerRatio = state.containerW / (state.containerH - controlBarHeight());
      const terminalRatio = terminalW / terminalH;

      if (containerRatio > terminalRatio) {
        fit = "height";
      } else {
        fit = "width";
      }
    }

    if (fit === false || fit === "none") {
      return {};
    } else if (fit === "width") {
      const scale = state.containerW / terminalW;

      return {
        scale: scale,
        width: state.containerW,
        height: terminalH * scale + controlBarHeight(),
      };
    } else if (fit === "height") {
      const scale = (state.containerH - controlBarHeight()) / terminalH;

      return {
        scale: scale,
        width: terminalW * scale,
        height: state.containerH,
      };
    } else {
      throw `unsupported fit mode: ${fit}`;
    }
  });

  const onFullscreenChange = () => {
    setState("isFullscreen", document.fullscreenElement ?? document.webkitFullscreenElement);
  };

  const toggleFullscreen = () => {
    if (state.isFullscreen) {
      (document.exitFullscreen ?? document.webkitExitFullscreen ?? (() => {})).apply(document);
    } else {
      (wrapperRef.requestFullscreen ?? wrapperRef.webkitRequestFullscreen ?? (() => {})).apply(
        wrapperRef,
      );
    }
  };

  const toggleHelp = () => {
    if (isHelpVisible()) {
      setIsHelpVisible(false);
    } else {
      core.pause();
      setIsHelpVisible(true);
    }
  };

  const onKeyDown = (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) {
      return;
    }

    if (e.key == " ") {
      core.togglePlay();
    } else if (e.key == ",") {
      core.step(-1).then(updateTime);
    } else if (e.key == ".") {
      core.step().then(updateTime);
    } else if (e.key == "f") {
      toggleFullscreen();
    } else if (e.key == "m") {
      toggleMuted();
    } else if (e.key == "[") {
      core.seek({ marker: "prev" });
    } else if (e.key == "]") {
      core.seek({ marker: "next" });
    } else if (e.key.charCodeAt(0) >= 48 && e.key.charCodeAt(0) <= 57) {
      const pos = (e.key.charCodeAt(0) - 48) / 10;
      core.seek(`${pos * 100}%`);
    } else if (e.key == "?") {
      toggleHelp();
    } else if (e.key == "ArrowLeft") {
      if (e.shiftKey) {
        core.seek("<<<");
      } else {
        core.seek("<<");
      }
    } else if (e.key == "ArrowRight") {
      if (e.shiftKey) {
        core.seek(">>>");
      } else {
        core.seek(">>");
      }
    } else if (e.key == "Escape") {
      setIsHelpVisible(false);
    } else {
      return;
    }

    e.stopPropagation();
    e.preventDefault();
  };

  const wrapperOnMouseMove = () => {
    if (state.isFullscreen) {
      onUserActive(true);
    }
  };

  const playerOnMouseLeave = () => {
    if (!state.isFullscreen) {
      onUserActive(false);
    }
  };

  const startTimeUpdates = () => {
    timeUpdateIntervalId = setInterval(updateTime, 100);
  };

  const stopTimeUpdates = () => {
    clearInterval(timeUpdateIntervalId);
  };

  const updateTime = async () => {
    const currentTime = await core.getCurrentTime();
    const remainingTime = await core.getRemainingTime();
    const progress = await core.getProgress();

    setState({ currentTime, remainingTime, progress });
  };

  const onUserActive = (show) => {
    clearTimeout(userActivityTimeoutId);

    if (show) {
      userActivityTimeoutId = setTimeout(() => onUserActive(false), 2000);
    }

    setUserActive(show);
  };

  const theme = createMemo(() => {
    const name = props.theme || "auto/asciinema";

    if (name.slice(0, 5) === "auto/") {
      return {
        name: name.slice(5),
        colors: originalTheme(),
      };
    } else {
      return { name };
    }
  });

  const playerStyle = () => {
    const style = {};

    if ((props.fit === false || props.fit === "none") && props.terminalFontSize !== undefined) {
      if (props.terminalFontSize === "small") {
        style["font-size"] = "12px";
      } else if (props.terminalFontSize === "medium") {
        style["font-size"] = "18px";
      } else if (props.terminalFontSize === "big") {
        style["font-size"] = "24px";
      } else {
        style["font-size"] = props.terminalFontSize;
      }
    }

    const size = terminalElementSize();

    if (size.width !== undefined) {
      style["width"] = `${size.width}px`;
      style["height"] = `${size.height}px`;
    }

    if (props.terminalFontFamily !== undefined) {
      style["--term-font-family"] = props.terminalFontFamily;
    }

    const themeColors = theme().colors;

    if (themeColors) {
      style["--term-color-foreground"] = themeColors.foreground;
      style["--term-color-background"] = themeColors.background;
    }

    return style;
  };

  const play = () => {
    coreReady.then(() => core.play());
  };

  const togglePlay = () => {
    coreReady.then(() => core.togglePlay());
  };

  const toggleMuted = () => {
    coreReady.then(() => {
      if (isMuted() === true) {
        core.unmute();
      } else {
        core.mute();
      }
    });
  };

  const seek = (pos) => {
    coreReady.then(() => core.seek(pos));
  };

  const playerClass = () => `ap-player ap-default-term-ff asciinema-player-theme-${theme().name}`;
  const terminalScale = () => terminalElementSize()?.scale;

  const el = (
    <div
      class="ap-wrapper"
      classList={{ "ap-hud": controlsVisible() }}
      tabIndex="-1"
      onKeyDown={onKeyDown}
      onMouseMove={wrapperOnMouseMove}
      onFullscreenChange={onFullscreenChange}
      onWebkitFullscreenChange={onFullscreenChange}
      ref={wrapperRef}
    >
      <div
        class={playerClass()}
        style={playerStyle()}
        onMouseLeave={playerOnMouseLeave}
        onMouseMove={() => onUserActive(true)}
        ref={playerRef}
      >
        <Terminal
          cols={terminalCols()}
          rows={terminalRows()}
          scale={terminalScale()}
          blinking={blinking()}
          lineHeight={props.terminalLineHeight}
          theme={theme().colors}
          core={core}
          stats={stats.terminal}
        />
        <Show when={props.controls !== false}>
          <ControlBar
            duration={duration()}
            currentTime={state.currentTime}
            remainingTime={state.remainingTime}
            progress={state.progress}
            markers={markers}
            isPlaying={isPlaying() || overlay() == "loader"}
            isPausable={state.isPausable}
            isSeekable={state.isSeekable}
            isMuted={isMuted()}
            onPlayClick={togglePlay}
            onFullscreenClick={toggleFullscreen}
            onHelpClick={toggleHelp}
            onSeekClick={seek}
            onMuteClick={toggleMuted}
            ref={controlBarRef}
          />
        </Show>
        <Switch>
          <Match when={overlay() == "start"}>
            <StartOverlay onClick={play} />
          </Match>
          <Match when={overlay() == "loader"}>
            <LoaderOverlay />
          </Match>
          <Match when={overlay() == "error"}>
            <ErrorOverlay />
          </Match>
        </Switch>
        <Transition name="slide">
          <Show when={overlay() == "info"}>
            <InfoOverlay message={infoMessage()} wasPlaying={wasPlaying()} />
          </Show>
        </Transition>
        <Show when={isHelpVisible()}>
          <HelpOverlay
            onClose={() => setIsHelpVisible(false)}
            isPausable={state.isPausable}
            isSeekable={state.isSeekable}
            hasAudio={isMuted() !== undefined}
          />
        </Show>
      </div>
    </div>
  );

  return el;
};
