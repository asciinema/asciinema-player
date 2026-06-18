import { batch, createMemo, createSignal, Match, onCleanup, onMount, Switch } from "solid-js";
import { Transition } from "solid-transition-group";
import { debounce } from "../util";
import Terminal from "./Terminal";
import ControlBar from "./ControlBar";
import ErrorOverlay from "./ErrorOverlay";
import LoaderOverlay from "./LoaderOverlay";
import InfoOverlay from "./InfoOverlay";
import StartOverlay from "./StartOverlay";
import HelpOverlay from "./HelpOverlay";
import KeystrokesOverlay from "./KeystrokesOverlay";
import { formatKeystroke } from "../keystrokes";

const CONTROL_BAR_HEIGHT = 32; // must match height of div.ap-control-bar in CSS
const MAX_KEYSTROKES = 4;

export default (props) => {
  const logger = props.logger;
  const core = props.core;
  const autoPlay = props.autoPlay;
  const charW = props.charW;
  const charH = props.charH;
  const bordersW = props.bordersW;
  const bordersH = props.bordersH;
  const themeOption = props.theme ?? "auto/asciinema";
  const preferEmbeddedTheme = themeOption.slice(0, 5) === "auto/";
  const themeName = preferEmbeddedTheme ? themeOption.slice(5) : themeOption;

  const [terminalSize, setTerminalSize] = createTerminalSizeSignal(props.cols, props.rows);
  const [containerSize, setContainerSize] = createContainerSizeSignal();
  const [isPausable, setIsPausable] = createSignal(true);
  const [isSeekable, setIsSeekable] = createSignal(true);
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(null);
  const [remainingTime, setRemainingTime] = createSignal(null);
  const [progress, setProgress] = createSignal(null);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [isMuted, setIsMuted] = createSignal(undefined);
  const [wasPlaying, setWasPlaying] = createSignal(false);
  const [overlay, setOverlay] = createSignal(!autoPlay ? "start" : null);
  const [infoMessage, setInfoMessage] = createSignal(null);
  const [blinking, setBlinking] = createSignal(false);
  const [duration, setDuration] = createSignal(null);
  const [markers, setMarkers] = createSignal([]);
  const [userActive, setUserActive] = createSignal(false);
  const [isHelpVisible, setIsHelpVisible] = createSignal(false);
  const [originalTheme, setOriginalTheme] = createSignal(null);
  const terminalCols = createMemo(() => terminalSize().cols || 80);
  const terminalRows = createMemo(() => terminalSize().rows || 24);
  const controlBarHeight = () => (props.controls === false ? 0 : CONTROL_BAR_HEIGHT);
  const [hideKeystroke, setHideKeystroke] = createSignal(props.hideKeystroke);
  const [keystrokes, setKeystrokes] = createSignal([]);

  const controlsVisible = () =>
    props.controls === true || (props.controls === "auto" && userActive());

  let nextKeystrokeId = 1;
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

  const onCoreReady = ({ isPausable, isSeekable }) => {
    batch(() => {
      setIsPausable(isPausable);
      setIsSeekable(isSeekable);
    });
  };

  const onCoreMetadata = (meta) => {
    batch(() => {
      if (meta.duration !== undefined) {
        setDuration(meta.duration);
        setCurrentTime(0);
        setRemainingTime(meta.duration);
        setProgress(0);
      }

      if (meta.markers !== undefined) {
        setMarkers(meta.markers);
      }

      if (meta.hasAudio !== undefined) {
        setIsMuted(meta.hasAudio ? false : undefined);
      }
    });
  };

  const onCoreReset = ({ size, theme }) => {
    batch(() => {
      setTerminalSize(size);

      if (theme !== undefined) {
        setOriginalTheme(theme);
      }
    });
  };

  const onCoreResize = (size) => {
    setTerminalSize(size);
  };

  const onCorePlay = () => {
    setOverlay(null);
  };

  const onCorePlaying = () => {
    batch(() => {
      setIsPlaying(true);
      setWasPlaying(true);
      setOverlay(null);
      onPlaying();
    });
  };

  const onCorePause = () => {
    batch(() => {
      setIsPlaying(false);
      onStopped();
    });
  };

  const onCoreLoading = () => {
    batch(() => {
      setIsPlaying(false);
      onStopped();
      setOverlay("loader");
      clearKeystrokes();
    });
  };

  const onCoreOffline = ({ message }) => {
    batch(() => {
      setIsPlaying(false);
      onStopped();
      clearKeystrokes();

      if (message !== undefined) {
        setInfoMessage(message);
        setOverlay("info");
      }
    });
  };

  const onCoreMuted = (muted) => {
    setIsMuted(muted);
  };

  const stats = { terminal: { renders: 0 } };

  const onCoreEnded = ({ message }) => {
    batch(() => {
      setIsPlaying(false);
      onStopped();

      if (message !== undefined) {
        setInfoMessage(message);
        setOverlay("info");
      }
    });

    logger.debug("stats", stats.terminal);
  };

  const onCoreError = () => {
    clearKeystrokes();
    setOverlay("error");
  };

  const onCoreInput = ({ data }) => {
    if (hideKeystroke()) {
      return;
    }

    const keystroke = formatKeystroke(data, logger);

    if (keystroke === null) {
      return;
    }

    const currentKeystrokes = keystrokes();
    const latestKeystroke = currentKeystrokes[currentKeystrokes.length - 1];

    if (latestKeystroke?.kind === "text" && keystroke.kind === "text") {
      latestKeystroke.append(keystroke.label);
      return;
    }

    if (
      latestKeystroke?.kind === "special" &&
      keystroke.kind === "special" &&
      latestKeystroke.key === keystroke.label
    ) {
      latestKeystroke.increment();
      return;
    }

    setKeystrokes([...currentKeystrokes, createKeystroke(keystroke)].slice(-MAX_KEYSTROKES));
  };

  const onCoreSeeked = () => {
    updateTime();
    clearKeystrokes();
  };

  const clearKeystrokes = () => {
    setKeystrokes([]);
  };

  const removeKeystroke = (id) => {
    setKeystrokes((keystrokes) => keystrokes.filter((keystroke) => keystroke.id !== id));
  };

  const createKeystroke = ({ kind, label }) => {
    const [value, setValue] = createSignal(label);
    const [count, setCount] = createSignal(1);
    const [rev, setRev] = createSignal(0);

    return {
      id: nextKeystrokeId++,
      kind,
      key: label,
      label: () => (count() === 1 ? value() : `${value()} × ${count()}`),
      rev,
      append: (label) => {
        setValue((value) => value + label);
        setRev((rev) => rev + 1);
      },
      increment: () => {
        setCount((count) => count + 1);
        setRev((rev) => rev + 1);
      },
    };
  };

  core.addEventListener("ready", onCoreReady);
  core.addEventListener("metadata", onCoreMetadata);
  core.addEventListener("play", onCorePlay);
  core.addEventListener("playing", onCorePlaying);
  core.addEventListener("pause", onCorePause);
  core.addEventListener("loading", onCoreLoading);
  core.addEventListener("offline", onCoreOffline);
  core.addEventListener("muted", onCoreMuted);
  core.addEventListener("ended", onCoreEnded);
  core.addEventListener("error", onCoreError);
  core.addEventListener("input", onCoreInput);
  core.addEventListener("seeked", onCoreSeeked);
  core.addEventListener("reset", onCoreReset);
  core.addEventListener("resize", onCoreResize);

  const setupResizeObserver = () => {
    resizeObserver = new ResizeObserver(
      debounce((_entries) => {
        setContainerSize({ width: wrapperRef.offsetWidth, height: wrapperRef.offsetHeight });
        wrapperRef.dispatchEvent(new CustomEvent("resize", { detail: { el: playerRef } }));
      }, 10),
    );

    resizeObserver.observe(wrapperRef);
  };

  onMount(async () => {
    logger.info("view: mounted");
    logger.debug("view: font measurements", { charW, charH });
    setupResizeObserver();
    setContainerSize({ width: wrapperRef.offsetWidth, height: wrapperRef.offsetHeight });
  });

  onCleanup(() => {
    core.removeEventListener("ready", onCoreReady);
    core.removeEventListener("metadata", onCoreMetadata);
    core.removeEventListener("play", onCorePlay);
    core.removeEventListener("playing", onCorePlaying);
    core.removeEventListener("pause", onCorePause);
    core.removeEventListener("loading", onCoreLoading);
    core.removeEventListener("offline", onCoreOffline);
    core.removeEventListener("muted", onCoreMuted);
    core.removeEventListener("ended", onCoreEnded);
    core.removeEventListener("error", onCoreError);
    core.removeEventListener("input", onCoreInput);
    core.removeEventListener("seeked", onCoreSeeked);
    core.removeEventListener("reset", onCoreReset);
    core.removeEventListener("resize", onCoreResize);
    core.stop();
    stopTimeUpdates();
    resizeObserver.disconnect();
  });

  const terminalElementSize = createMemo(() => {
    const terminalW = charW * terminalCols() + bordersW;
    const terminalH = charH * terminalRows() + bordersH;

    let fit = props.fit ?? "width";

    const currentContainerSize = containerSize();

    if (fit === "both" || isFullscreen()) {
      const containerRatio =
        currentContainerSize.width / (currentContainerSize.height - controlBarHeight());

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
      const scale = currentContainerSize.width / terminalW;

      return {
        scale: scale,
        width: currentContainerSize.width,
        height: terminalH * scale + controlBarHeight(),
      };
    } else if (fit === "height") {
      const scale = (currentContainerSize.height - controlBarHeight()) / terminalH;

      return {
        scale: scale,
        width: terminalW * scale,
        height: currentContainerSize.height,
      };
    } else {
      throw new Error(`unsupported fit mode: ${fit}`);
    }
  });

  const onFullscreenChange = () => {
    setIsFullscreen(document.fullscreenElement ?? document.webkitFullscreenElement);
  };

  const toggleFullscreen = () => {
    if (isFullscreen()) {
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

  const toggleKeystroke = () => {
    if (hideKeystroke()) {
      setHideKeystroke(false);
    } else {
      clearKeystrokes();
      setHideKeystroke(true);
    }
  };

  const onKeyDown = (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) {
      return;
    }

    // Let a focused control button activate itself on Space/Enter rather than
    // also triggering the global keyboard shortcuts.
    if ((e.key == " " || e.key == "Enter") && e.target instanceof HTMLButtonElement) {
      return;
    }

    if (e.key == " ") {
      togglePlay();
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
    } else if (e.key == "k") {
      toggleKeystroke();
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
    if (isFullscreen()) {
      onUserActive(true);
    }
  };

  const playerOnMouseLeave = () => {
    if (!isFullscreen()) {
      onUserActive(false);
    }
  };

  const startTimeUpdates = () => {
    clearInterval(timeUpdateIntervalId);
    timeUpdateIntervalId = setInterval(updateTime, 100);
  };

  const stopTimeUpdates = () => {
    clearInterval(timeUpdateIntervalId);
  };

  const updateTime = async () => {
    const newCurrentTime = await core.getCurrentTime();
    const newRemainingTime = await core.getRemainingTime();
    const newProgress = await core.getProgress();

    batch(() => {
      setCurrentTime(newCurrentTime);
      setRemainingTime(newRemainingTime);
      setProgress(newProgress);
    });
  };

  const onUserActive = (show) => {
    clearTimeout(userActivityTimeoutId);

    if (show) {
      userActivityTimeoutId = setTimeout(() => onUserActive(false), 2000);
    }

    setUserActive(show);
  };

  const embeddedTheme = createMemo(() => (preferEmbeddedTheme ? originalTheme() : null));

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

    const themeColors = embeddedTheme();

    if (themeColors) {
      style["--term-color-foreground"] = themeColors.foreground;
      style["--term-color-background"] = themeColors.background;
    }

    return style;
  };

  const play = () => {
    core.play();
  };

  const togglePlay = () => {
    if (isPlaying()) {
      core.pause();
    } else {
      core.play();
    }
  };

  const toggleMuted = () => {
    if (isMuted() === true) {
      core.unmute();
    } else {
      core.mute();
    }
  };

  const seek = (pos) => {
    core.seek(pos);
  };

  const playerClass = () => `ap-player ap-default-term-ff asciinema-player-theme-${themeName}`;
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
          cursorMode={props.cursorMode}
          boldIsBright={props.boldIsBright}
          adaptivePalette={props.adaptivePalette}
          lineHeight={props.terminalLineHeight}
          preferEmbeddedTheme={preferEmbeddedTheme}
          core={core}
          logger={logger}
          onReady={props.onTerminalReady}
          stats={stats.terminal}
        />
        <Show when={props.controls !== false}>
          <ControlBar
            duration={duration()}
            currentTime={currentTime()}
            remainingTime={remainingTime()}
            progress={progress()}
            markers={markers()}
            isPlaying={isPlaying() || overlay() == "loader"}
            isPausable={isPausable()}
            isSeekable={isSeekable()}
            isMuted={isMuted()}
            onPlayClick={togglePlay}
            onFullscreenClick={toggleFullscreen}
            onHelpClick={toggleHelp}
            onSeekClick={seek}
            onMuteClick={toggleMuted}
            ref={controlBarRef}
          />
        </Show>
        <Show when={keystrokes().length > 0}>
          <KeystrokesOverlay
            bottomOffset={controlBarHeight()}
            fontFamily={props.terminalFontFamily}
            keystrokes={keystrokes()}
            onExpired={removeKeystroke}
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
            isPausable={isPausable()}
            isSeekable={isSeekable()}
            hasAudio={isMuted() !== undefined}
          />
        </Show>
      </div>
    </div>
  );

  return el;
};

function createTerminalSizeSignal(cols, rows) {
  return createSignal(
    { cols, rows },
    { equals: (newVal, oldVal) => newVal.cols === oldVal.cols && newVal.rows === oldVal.rows },
  );
}

function createContainerSizeSignal() {
  return createSignal(
    { width: 0, height: 0 },
    {
      equals: (newVal, oldVal) => newVal.width === oldVal.width && newVal.height === oldVal.height,
    },
  );
}
