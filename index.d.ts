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
