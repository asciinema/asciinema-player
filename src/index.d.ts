/**
 * @param src the url for fetching the asciicast recording
 * @param element the container element to mount the player into
 * @param options player options
 * @returns the created AsciinemaPlayer instance
 */
export function create(
  src: RequestInfo | URL,
  element: HTMLElement,
  options?: options,
): AsciinemaPlayer;
/**
 * @param data the object for fetching data and parsing it to a asciicast recording
 * @param element the container element to mount the player into
 * @param options player options
 * @returns the created AsciinemaPlayer instance
 */
export function create(
  data: {
    url: RequestInfo | URL;
    fetchOpts?: RequestInit;
    parser?: "asciicast" | "ttyrec" | "typescript" | ((response: Response) => recording);
  },
  element: HTMLElement,
  options?: options,
): AsciinemaPlayer;
/**
 * @param data the object for providing asciicast recording, either directly or via a function
 * @param element the container element to mount the player into
 * @param options player options
 * @returns the created AsciinemaPlayer instance
 */
export function create(
  data: {
    data: asciicastProvider;
  },
  element: HTMLElement,
  options?: options,
): AsciinemaPlayer;

export type recording = {
  cols: number;
  rows: number;
  events: Array<[number, "o" | "i" | "m" | "r", string]>;
};

export type asciicastV1 = {
  version: 1;
  width: number;
  height: number;
  duration: number;
  command?: string;
  title?: string;
  env: Record<string, string>;
  stdout: Array<[number, string]>;
};
type theme = {
  fg: string;
  bg: string;
  palette: string[];
};
export type asciicastV2 = [
  {
    version: 2;
    width: number;
    height: number;
    timestamp?: number;
    duration?: number;
    idle_time_limit?: number;
    command?: string;
    title?: string;
    env: Record<string, string>;
    theme?: theme;
  },
  ...Array<[number, "o" | "i" | "m" | "r", string]>,
];
export type asciicastV3 = [
  {
    version: 3;
    term: {
      cols: number;
      rows: number;
      type: string;
      version?: string;
      theme?: theme;
    };
    timestamp?: number;
    duration?: number;
    idle_time_limit?: number;
    command?: string;
    title?: string;
    env?: Record<string, string>;
    tags?: string[];
  },
  ...Array<[number, "o" | "i" | "m" | "r" | "x", string]>,
];

export type asciicast = asciicastV1 | asciicastV2 | asciicastV3 | string;
export type asciicastProvider = asciicast | (() => Promise<asciicast>) | (() => asciicast);

/**
 * Look and feel of the asciinema player can be configured extensively by passing additional options
 * when mounting the player on the page.
 *
 * @example
 * AsciinemaPlayer.create('/demo.cast', document.getElementById('demo'), {
 *   speed: 2,
 *   idleTimeLimit: 2,
 * });
 *
 */
export interface options {
  /**
   * Width of player's terminal in columns.
   *
   * When not set it defaults to **80** (until asciicast gets loaded)
   * and to terminal width saved in the asciicast file (after it gets loaded).
   *
   * It's recommended to set it to the same value as in asciicast file to avoid player
   * resizing itself from 80x24 to actual dimensions of the recording when it gets loaded.
   *
   * @default 80 (until load) / asciicast width (after load)
   */
  cols?: number;

  /**
   * Height of player's terminal in rows (lines).
   *
   * When not set it defaults to **24** (until asciicast gets loaded)
   * and to terminal height saved in the asciicast file (after it gets loaded).
   *
   * Same recommendation as for `cols` applies here.
   *
   * @default 24 (until load) / asciicast height (after load)
   */
  rows?: number;

  /**
   * Set this option to true if the playback should start automatically.
   *
   * @default false
   */
  autoPlay?: boolean;

  /**
   * Set this option to true if the recording should be preloaded on player's initialization.
   *
   * Tip: Check *Loading a recording* for available options of getting a recording into the player
   * in the most suitable way.
   *
   * @default false
   */
  preload?: boolean;

  /**
   * Set this option to either true or a number if playback should be looped.
   *
   * When set to a number (e.g. 3) then the recording will be re-played given number of times
   * and stopped after that.
   *
   * @default false
   */
  loop?: boolean | number;

  /**
   * Start the playback at a given time.
   *
   * Supported formats:
   * - `123` (number of seconds)
   * - `"2:03"` ("mm:ss")
   * - `"1:02:03"` ("hh:mm:ss")
   *
   * @default 0
   * @example
   * startAt: "1:23" // start at 1 minute 23 seconds
   */
  startAt?: number | `${number}:${number}` | `${number}:${number}:${number}`;

  /**
   * Playback speed. The value of 2 means 2x faster.
   *
   * @default 1
   * @example
   * speed: 2 // plays twice as fast
   */
  speed?: number;

  /**
   * Limit terminal inactivity to a given number of seconds.
   *
   * For example, when set to 2 any inactivity (pauses) longer than 2 seconds will be "compressed"
   * to 2 seconds.
   *
   * Defaults to:
   * - `idle_time_limit` from asciicast header (saved when passing `-i <sec>` to `asciinema rec`)
   * - no limit, when it was not specified at the time of recording
   *
   * Tip: This option makes the playback more pleasant for viewers,
   * and it's often better to use `idleTimeLimit` than `speed`.
   *
   * @default depends on asciicast header / no limit
   * @example
   * idleTimeLimit: 2 // compress pauses longer than 2s
   */
  idleTimeLimit?: number;

  /**
   * Terminal color theme.
   *
   * asciinema CLI 3.0 (and later) captures original terminal theme and embeds it in a recording file.
   * This lets the player replicate the exact colors by default.
   *
   * This option can be used to override the terminal theme.
   * See *Terminal themes* for a list of available built-in themes.
   *
   * If you'd like to configure the player to use the original theme when available,
   * falling back to a specific theme, prefix the theme name with `auto/`.
   *
   * @default "auto/asciinema" (since v3.8), "asciinema" (earlier)
   * @example
   * theme: "auto/dracula"
   */
  theme?: string;

  /**
   * Poster (a preview frame) to display until the playback is started.
   *
   * Supported poster specifications:
   * - `npt:1:23` — display recording "frame" at given time using NPT ("Normal Play Time")
   * - `data:text/plain,Poster text` — print given text
   *
   * Using NPT-based poster preloads the recording on player's initialization
   * regardless of `preload` option value.
   *
   * @default blank terminal or, when startAt is specified, screen contents at that time
   * @example
   * poster: "npt:1:23"
   * @example
   * poster: "data:text/plain,Hello \x1b[1;32mWorld"
   */
  poster?: string;

  /**
   * Audio file/stream to play together with the terminal session.
   *
   * For recorded sessions (asciicast files) the audio position is automatically synced
   * with the session playback - pausing/resuming/seeking is reflected in the audio playback.
   *
   * For live terminal streams audioUrl is expected to be a live audio source -
   * either a direct HTTP audio stream (.mp3, .aac, .ogg, etc.) such as Icecast/Shoutcast endpoint,
   * or HLS playlist (.m3u8).
   *
   * Tip: Ensure the audio endpoint allows CORS requests.
   *
   * Warning: When using audioUrl don't use `autoplay: true` — browsers often require
   * explicit user action before audio playback.
   *
   * @example
   * audioUrl: "/demo.mp3"
   * @example
   * audioUrl: "http://example.com/icecast/stream.ogg"
   */
  audioUrl?: string;

  /**
   * Selects fitting (sizing) behaviour with regards to player's container element.
   *
   * Possible values:
   * - `"width"` - scale to full width of the container
   * - `"height"` - scale to full height of the container (requires fixed height)
   * - `"both"` - scale to either full width or height (requires fixed height)
   * - `false` / `"none"` - don't scale, use fixed size font
   *
   * Note: Version 2.x supported only the behaviour of `false`.
   * Include `fit: false` to preserve the old sizing behaviour when upgrading from v2 to v3.
   *
   * @default "width"
   * @example
   * fit: "width"
   */
  fit?: "width" | "height" | "both" | "none" | false;

  /**
   * Hide or show user controls (bottom control bar).
   *
   * Valid values:
   * - `true` - always show controls
   * - `false` - never show controls
   * - `"auto"` - show on mouse movement, hide on inactivity
   *
   * @default "auto"
   * @example
   * controls: "auto"
   */
  controls?: boolean | "auto";

  /**
   * Defines a list of timeline markers.
   *
   * Markers set with this option override all markers embedded in asciicast files.
   * If this option is not set the player defaults to markers found in the recording file (if any).
   *
   * @example
   * markers: [5.0, 25.0, 66.6, 176.5]
   * @example
   * markers: [
   *   [5.0, "Installation"],
   *   [25.0, "Configuration"]
   * ]
   */
  markers?: (number | [number, string])[];

  /**
   * If pauseOnMarkers is set to true, the playback automatically pauses
   * on every marker encountered and can be resumed manually.
   *
   * Useful in live demos or presentations.
   *
   * @default false
   * @example
   * pauseOnMarkers: true
   */
  pauseOnMarkers?: boolean;

  /**
   * Size of the terminal font.
   *
   * Possible values:
   * - any valid CSS font-size value (e.g. `"15px"`)
   * - `"small"`
   * - `"medium"`
   * - `"big"`
   *
   * Warning: This option is effective only when `fit: false` is specified.
   *
   * @default "small"
   * @example
   * terminalFontSize: "15px"
   */
  terminalFontSize?: string;

  /**
   * Terminal font-family override.
   *
   * Use any valid CSS font-family value,
   * e.g. `'JetBrains Mono', Consolas, Menlo, monospace`.
   *
   * Note: If you want to use web fonts, see the Fonts section
   * for how to load them properly.
   *
   * @example
   * terminalFontFamily: "'JetBrains Mono', monospace"
   */
  terminalFontFamily?: string;

  /**
   * Terminal line height override.
   *
   * The value is relative to the font size (like CSS `em` unit).
   * Example: `1` means equal to font size; `2` means double spacing.
   *
   * @default 1.33333333
   * @example
   * terminalLineHeight: 1.5
   */
  terminalLineHeight?: number;

  /**
   * Set this option to `console`, i.e. `{ logger: console }`,
   * or any object implementing console API (.log(), .debug(), .info(), .warn(), .error())
   * to enable logging.
   *
   * Useful during development or debugging.
   *
   * @example
   * logger: console
   */
  logger?: {
    log(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };
}

/**
 * The player object, returned by create function, provides several methods that can be used
 * to control the player or obtain information about its state.
 */
interface AsciinemaPlayer {
  /**
   * Returns the current playback time in seconds.
   *
   * @example
   * player.getCurrentTime(); // => 1.23
   */
  getCurrentTime(): Promise<number>;

  /**
   * Returns the length of the recording in seconds, or null if the recording is not loaded yet.
   *
   * @example
   * player.getDuration(); // => 123.45
   */
  getDuration(): Promise<number | undefined>;

  /**
   * Initiates playback of the recording. If the recording hasn't been preloaded then it's loaded,
   * and playback is started.
   *
   * This function returns a promise which is fulfilled when the playback actually starts.
   * If you want to synchronize asciinema player with other elements on the page (e.g. audio element),
   * use this promise for coordination, or listen to `play` / `playing` events.
   *
   * @example
   * player.play();
   * @example
   * player.play().then(() => {
   *   console.log(`started! duration: ${player.getDuration()}`);
   * });
   */
  play(): Promise<void>;

  /**
   * Pauses playback. The playback is paused immediately.
   *
   * @example
   * player.pause();
   */
  pause(): Promise<void>;

  /**
   * Changes the playback location to specified time or marker.
   *
   * `location` can be:
   * - time in seconds, as number, e.g. `15`
   * - position in percentage, as string, e.g. `'50%'`
   * - specific marker by its 0-based index, as `{ marker: i }`, e.g. `{ marker: 3 }`
   * - previous marker, as `{ marker: 'prev' }`
   * - next marker, as `{ marker: 'next' }`
   *
   * This function returns a promise which is fulfilled when the location actually changes.
   *
   * @example
   * player.seek(15).then(() => {
   *   console.log(`current time: ${player.getCurrentTime()}`);
   * });
   * @example
   * player.seek("50%");
   * @example
   * player.seek({ marker: "next" });
   */
  seek(location: SeekLocation): Promise<void>;

  /**
   * Adds event listener, binding handler's `this` to the player object.
   * See Events for the list of all supported events.
   *
   * @example
   * player.addEventListener("play", function () {
   *   console.log("play!", this.getCurrentTime());
   * });
   * @example
   * player.addEventListener("input", function ({ data }) {
   *   console.log("input!", JSON.stringify(data));
   * });
   */
  addEventListener(
    event: "play" | "playing" | "pause" | "ended",
    handler: (this: AsciinemaPlayer) => void,
  ): void;

  /**
   * Adds event listener for `input` event, dispatched for every keyboard input that was recorded.
   * Callback's 1st argument is an object with `data` field, which contains registered input value.
   * Usually this is ASCII character representing a key, but may be a control character,
   * like `"\r"` (enter), `"\u0001"` (ctrl-a), `"\u0003"` (ctrl-c), etc.
   *
   * Note: input events are available only for asciicasts recorded with `--stdin` option,
   * i.e. `asciinema rec --stdin <filename>`.
   *
   * @example
   * player.addEventListener("input", function ({ data }) {
   *   // play keyboard typing sound or display key presses
   *   playSound(data);
   * });
   */
  addEventListener(
    event: "input",
    handler: (this: AsciinemaPlayer, detail: InputEventDetail) => void,
  ): void;

  /**
   * Adds event listener for `marker` event, dispatched for every marker encountered during playback.
   * Callback's 1st argument has `index` (0-based), `time` (seconds) and optional `label`.
   * Useful for orchestrating timed actions or fine-grained playback control (e.g. loop a section).
   *
   * @example
   * player.addEventListener("marker", function ({ index, time, label }) {
   *   console.log(`marker! ${index} - ${time} - ${label}`);
   * });
   */
  addEventListener(
    event: "marker",
    handler: (this: AsciinemaPlayer, detail: MarkerEventDetail) => void,
  ): void;

  /**
   * Use this function to dispose of the player, i.e. to shut it down, release all resources
   * and remove it from DOM.
   *
   * @example
   * player.dispose();
   */
  dispose(): void;
}

/** Seek location union matching the docs. */
export type SeekLocation =
  | number // seconds
  | `${number}%` // percentage string, e.g. "50%"
  | { marker: number } // go to marker by 0-based index
  | { marker: "prev" } // previous marker
  | { marker: "next" }; // next marker

/** Payload for the `input` event. */
export type InputEventDetail = {
  /**
   * Registered input value (ASCII or control char).
   *
   * @example
   * "\r" // Enter
   * @example
   * "\u0003" // Ctrl-C
   */
  data: string;
};

/** Payload for the `marker` event. */
export type MarkerEventDetail = {
  /** 0-based marker index. */
  index: number;
  /** Marker time in seconds. */
  time: number;
  /** Optional marker label. */
  label?: string | null;
};
