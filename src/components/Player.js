import { batch, createMemo, createSignal, Match, onCleanup, onMount, Switch } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { debounce, printablekeypress } from "../util";
import Terminal from "./Terminal";
import ControlBar from "./ControlBar";
import ErrorOverlay from "./ErrorOverlay";
import LoaderOverlay from "./LoaderOverlay";
import InfoOverlay from "./InfoOverlay";
import StartOverlay from "./StartOverlay";
import HelpOverlay from "./HelpOverlay";
import KeystrokesOverlay from "./KeystrokesOverlay";

const CONTROL_BAR_HEIGHT = 32; // must match height of div.ap-control-bar in CSS

export default (props) => {
  const logger = props.logger;
  const core = props.core;
  const autoPlay = props.autoPlay;

  const [state, setState] = createStore({
    lines: [],
    cursor: undefined,
    charW: props.charW,
    charH: props.charH,
    bordersW: props.bordersW,
    bordersH: props.bordersH,
    containerW: 0,
    containerH: 0,
    isPausable: true,
    isSeekable: true,
    isFullscreen: false,
    currentTime: null,
    remainingTime: null,
    progress: null,
    blink: true,
    cursorHold: false,
    keystroke: null,
    hideKeystroke: props.hideKeystroke,
  });

  const [isPlaying, setIsPlaying] = createSignal(false);
  const [overlay, setOverlay] = createSignal(!autoPlay ? "start" : null);
  const [infoMessage, setInfoMessage] = createSignal(null);

  const [terminalSize, setTerminalSize] = createSignal(
    { cols: props.cols, rows: props.rows },
    { equals: (newVal, oldVal) => newVal.cols === oldVal.cols && newVal.rows === oldVal.rows },
  );

  const [duration, setDuration] = createSignal(undefined);
  const [markers, setMarkers] = createStore([]);
  const [userActive, setUserActive] = createSignal(false);
  const [isHelpVisible, setIsHelpVisible] = createSignal(false);
  const [originalTheme, setOriginalTheme] = createSignal(undefined);
  const terminalCols = createMemo(() => terminalSize().cols || 80);
  const terminalRows = createMemo(() => terminalSize().rows || 24);
  const controlBarHeight = () => (props.controls === false ? 0 : CONTROL_BAR_HEIGHT);
  const [isKeystrokeVisible, setisKeystrokeVisible] = createSignal(false);

  const controlsVisible = () =>
    props.controls === true || (props.controls === "auto" && userActive());

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
    batch(() => {
      if (size_.rows < terminalSize().rows) {
        setState("lines", state.lines.slice(0, size_.rows));
      }

      setTerminalSize(size_);
    });
  }

  function setPoster(poster) {
    if (poster !== undefined && !autoPlay) {
      setState({
        lines: poster.lines,
        cursor: poster.cursor,
      });
    }
  }

  core.addEventListener(
    "init",
    ({ cols, rows, duration, theme, poster, markers, hideKeystroke }) => {
      batch(() => {
        resize({ cols, rows });
        setDuration(duration);
        setOriginalTheme(theme);
        setMarkers(markers);
        setPoster(poster);
        setisKeystrokeVisible(!hideKeystroke);
      });
    },
  );

  core.addEventListener("play", () => {
    setOverlay(null);
    setisKeystrokeVisible(false);
  });

  core.addEventListener("playing", () => {
    batch(() => {
      setIsPlaying(true);
      setOverlay(null);
      onPlaying();
    });
  });

  core.addEventListener("idle", () => {
    batch(() => {
      setIsPlaying(false);
      setisKeystrokeVisible(false);
      onStopped();
    });
  });

  core.addEventListener("loading", () => {
    batch(() => {
      setIsPlaying(false);
      onStopped();
      setOverlay("loader");
      setisKeystrokeVisible(false);
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

  core.addEventListener("ended", ({ message }) => {
    batch(() => {
      setIsPlaying(false);
      onStopped();
      setisKeystrokeVisible(false);

      if (message !== undefined) {
        setInfoMessage(message);
        setOverlay("info");
      }
    });
  });

  core.addEventListener("errored", () => {
    setOverlay("error");
  });

  core.addEventListener("input", ({ data }) => {
    if (state.hideKeystroke) {
      return;
    }
    var pressed_key = printablekeypress(data, logger);
    if (pressed_key === "") {
      setisKeystrokeVisible(false);
    } else {
      setisKeystrokeVisible(true);
      setState("keystroke", pressed_key);
    }
  });

  core.addEventListener("resize", resize);

  core.addEventListener("reset", ({ cols, rows, theme }) => {
    batch(() => {
      resize({ cols, rows });
      setOriginalTheme(theme);
      updateTerminal();
    });
  });

  core.addEventListener("seeked", () => {
    updateTime();
  });

  core.addEventListener("terminalUpdate", () => {
    if (frameRequestId === undefined) {
      frameRequestId = requestAnimationFrame(updateTerminal);
    }
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
    logger.info("player mounted");
    logger.debug("font measurements", { charW: state.charW, charH: state.charH });
    setupResizeObserver();
    const { isPausable, isSeekable, poster } = await core.init();

    batch(() => {
      setState({
        isPausable,
        isSeekable,
        containerW: wrapperRef.offsetWidth,
        containerH: wrapperRef.offsetHeight,
      });

      setPoster(poster);
    });

    if (autoPlay) {
      core.play();
    }
  });

  onCleanup(() => {
    core.stop();
    stopBlinking();
    stopTimeUpdates();
    resizeObserver.disconnect();
  });

  const updateTerminal = () => {
    const changedLines = core.getChangedLines();

    batch(() => {
      if (changedLines) {
        changedLines.forEach((line, i) => {
          setState("lines", i, reconcile(line));
        });
      }

      setState("cursor", reconcile(core.getCursor()));
      setState("cursorHold", true);
    });

    frameRequestId = undefined;
  };

  const terminalElementSize = createMemo(() => {
    const terminalW = state.charW * terminalCols() + state.bordersW;
    const terminalH = state.charH * terminalRows() + state.bordersH;

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

  const onKeyDown = (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) {
      return;
    }

    if (e.key == " ") {
      core.togglePlay();
    } else if (e.key == ".") {
      core.step();
      updateTime();
    } else if (e.key == "f") {
      toggleFullscreen();
    } else if (e.key == "[") {
      core.seek({ marker: "prev" });
    } else if (e.key == "]") {
      core.seek({ marker: "next" });
    } else if (e.key.charCodeAt(0) >= 48 && e.key.charCodeAt(0) <= 57) {
      const pos = (e.key.charCodeAt(0) - 48) / 10;
      core.seek(`${pos * 100}%`);
    } else if (e.key == "?") {
      if (isHelpVisible()) {
        setIsHelpVisible(false);
      } else {
        core.pause();
        setIsHelpVisible(true);
      }
    } else if (e.key == "k") {
      if (state.hideKeystroke) {
        setState("hideKeystroke", false);
      } else {
        setisKeystrokeVisible(false);
        setState("hideKeystroke", true);
      }
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

  const updateTime = () => {
    const currentTime = core.getCurrentTime();
    const remainingTime = core.getRemainingTime();
    const progress = core.getProgress();

    setState({ currentTime, remainingTime, progress });
  };

  const startBlinking = () => {
    blinkIntervalId = setInterval(() => {
      setState((state) => {
        const changes = { blink: !state.blink };

        if (changes.blink) {
          changes.cursorHold = false;
        }

        return changes;
      });
    }, 500);
  };

  const stopBlinking = () => {
    clearInterval(blinkIntervalId);
    setState("blink", true);
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

    const themeColors = theme().colors;

    if (themeColors !== undefined) {
      style["--term-color-foreground"] = themeColors.foreground;
      style["--term-color-background"] = themeColors.background;

      themeColors.palette.forEach((color, i) => {
        style[`--term-color-${i}`] = color;
      });
    }

    return style;
  };

  const playerClass = () => `ap-player asciinema-player-theme-${theme().name}`;
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
          blink={state.blink}
          lines={state.lines}
          cursor={state.cursor}
          cursorHold={state.cursorHold}
          fontFamily={props.terminalFontFamily}
          lineHeight={props.terminalLineHeight}
          ref={terminalRef}
        />
        <Show when={props.controls !== false}>
          <ControlBar
            duration={duration()}
            currentTime={state.currentTime}
            remainingTime={state.remainingTime}
            progress={state.progress}
            markers={markers}
            isPlaying={isPlaying()}
            isPausable={state.isPausable}
            isSeekable={state.isSeekable}
            onPlayClick={() => core.togglePlay()}
            onFullscreenClick={toggleFullscreen}
            onSeekClick={(pos) => core.seek(pos)}
            ref={controlBarRef}
          />
        </Show>
        <Show when={isKeystrokeVisible()}>
          <KeystrokesOverlay fontFamily={props.terminalFontFamily} keystroke={state.keystroke} />
        </Show>
        <Switch>
          <Match when={overlay() == "start"}>
            <StartOverlay onClick={() => core.play()} />
          </Match>
          <Match when={overlay() == "loader"}>
            <LoaderOverlay />
          </Match>
          <Match when={overlay() == "info"}>
            <InfoOverlay message={infoMessage()} fontFamily={props.terminalFontFamily} />
          </Match>
          <Match when={overlay() == "error"}>
            <ErrorOverlay />
          </Match>
        </Switch>
        <Show when={isHelpVisible()}>
          <HelpOverlay
            fontFamily={props.terminalFontFamily}
            onClose={() => setIsHelpVisible(false)}
          />
        </Show>
      </div>
    </div>
  );

  return el;
};
