export type BuiltInParser = "asciicast" | "typescript" | "ttyrec";

export type RecordingEventCode = "o" | "i" | "r" | "m";
export type RecordingEvent = [time: number, code: RecordingEventCode, data: unknown];

export interface Recording {
  cols: number;
  rows: number;
  events: Iterable<RecordingEvent>;
  theme?: unknown;
  idleTimeLimit?: number;
}

export interface ParserOptions {
  encoding: string;
}

export type Parser = (data: unknown, options: ParserOptions) => Recording | Promise<Recording>;

export type RecordingData =
  | string
  | ArrayBuffer
  | Response
  | unknown[]
  | Record<string, unknown>;

export interface UrlSource {
  url: string | string[];
  fetchOpts?: RequestInit;
  parser?: BuiltInParser | Parser;
  encoding?: string;
  inputOffset?: number;
  minFrameTime?: number;
}

export interface DataSource {
  data: RecordingData | (() => RecordingData | Promise<RecordingData>);
  parser?: BuiltInParser | Parser;
  encoding?: string;
  inputOffset?: number;
  minFrameTime?: number;
}

export type Source = string | UrlSource | DataSource;

export type Marker = number | [time: number, label: string];

export interface Logger {
  log(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface Options {
  /** Experimental: mount an independently maintained VT and renderer. */
  terminalBackend?: TerminalBackendFactory;
  cols?: number;
  rows?: number;
  autoPlay?: boolean;
  autoplay?: boolean;
  preload?: boolean;
  loop?: boolean | number;
  startAt?: number | string;
  speed?: number;
  idleTimeLimit?: number;
  theme?: string;
  poster?: string;
  audioUrl?: string;
  adaptivePalette?: boolean;
  boldIsBright?: boolean;
  fit?: "width" | "height" | "both" | "none" | false;
  controls?: boolean | "auto";
  cursorMode?: "blinking" | "steady" | "hidden";
  keystrokeOverlay?: boolean;
  markers?: Marker[];
  pauseOnMarkers?: boolean;
  terminalFontSize?: "small" | "medium" | "big" | string;
  terminalFontFamily?: string;
  terminalLineHeight?: number;
  logger?: Logger;
}

export interface TerminalSize { cols: number; rows: number; }
export interface TerminalTheme {
  foreground: string;
  background: string;
  palette: string[];
}
export interface TerminalAppearance {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  blinking: boolean;
  cursorMode: "blinking" | "steady" | "hidden";
  boldIsBright: boolean;
  adaptivePalette: boolean;
  theme: TerminalTheme;
}
export interface TerminalReset {
  size: TerminalSize;
  /** VT output restoring the recording segment's initial terminal state. */
  init?: string;
  theme?: TerminalTheme | null;
}
export interface TerminalBackend {
  /** These mutations are synchronous and must preserve stream order. */
  write(data: string): void;
  resize(size: TerminalSize): void;
  reset(state: TerminalReset): void;
  update(appearance: TerminalAppearance): void;
  /** Draw all preceding mutations. The player coalesces calls per animation frame. */
  present(): void | Promise<void>;
  dispose(): void;
}
export type TerminalBackendFactory = (context: {
  element: HTMLDivElement;
  size: TerminalSize;
  appearance: TerminalAppearance;
}) => TerminalBackend | Promise<TerminalBackend>;

export type SeekLocation =
  | number
  | `${number}%`
  | { marker: number | "prev" | "next" };

export interface InputEvent {
  data: string;
}

export interface MarkerEvent {
  index: number;
  time: number;
  label: string;
}

export interface Player {
  el: HTMLElement;
  dispose(): void;
  getCurrentTime(): number;
  getDuration(): number | undefined;
  play(): Promise<boolean | void>;
  pause(): Promise<boolean | void>;
  seek(location: SeekLocation): Promise<boolean | void>;
  addEventListener(
    eventName: "play" | "playing" | "pause" | "ended",
    handler: (this: Player) => void,
  ): void;
  addEventListener(eventName: "input", handler: (this: Player, event: InputEvent) => void): void;
  addEventListener(eventName: "marker", handler: (this: Player, event: MarkerEvent) => void): void;
}

export function create(src: Source, containerElement: HTMLElement, opts?: Options): Player;
