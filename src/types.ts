/** The coordinate system used by every segment in one timeline. */
export type ScrollUnit = 'px' | 'progress';

/** CSS-compatible easing keywords supported by the timeline engine. */
export type EasingName = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** A custom easing function receives and returns normalized progress. */
export type EasingFunction = (progress: number) => number;

/** A named or custom easing definition. */
export type Easing = EasingName | EasingFunction;

/** A mapping between one scroll interval and one media-time interval. */
export interface TimelineSegment {
  /** Scroll interval expressed in `scrollUnit`. */
  readonly scroll: readonly [start: number, end: number];
  /** Media-time interval in seconds; forward and reverse ranges are valid. */
  readonly media: readonly [start: number, end: number];
  /** Coordinate unit, defaulting to pixels. */
  readonly scrollUnit?: ScrollUnit;
  /** Opaque media clip ID carried through resolution. */
  readonly clip?: string;
  /** Override for the timeline-level easing default. */
  readonly easing?: Easing;
}

/** Frame snapping is disabled unless `snap` is explicitly enabled. */
export type FrameConfig =
  | {
      /** Explicitly keeps frame snapping disabled. */
      readonly snap?: false;
      readonly fps?: never;
    }
  | {
      /** Enables nearest-frame snapping. */
      readonly snap: true;
      /** Finite, positive frame rate used for snapping. */
      readonly fps: number;
    };

/** Configuration captured by `createTimeline`. */
export interface TimelineOptions {
  /** Non-empty collection of mappings normalized at creation time. */
  readonly segments: readonly TimelineSegment[];
  /** Default easing inherited by segments without an override. */
  readonly easing?: Easing;
  /** Optional nearest-frame snapping configuration. */
  readonly frame?: FrameConfig;
}

/** The timeline region containing a resolved position. */
export type TimelinePhase = 'before' | 'active' | 'gap' | 'after';

/** The deterministic result of resolving one timeline position. */
export interface TimelineResolution {
  /** Region of the timeline containing the position. */
  readonly phase: TimelinePhase;
  /** Original input index when `phase` is `active`. */
  readonly segmentIndex: number | null;
  /** Clip selected by the active or held segment. */
  readonly clipId: string | null;
  /** Linear progress inside an active segment. */
  readonly rawProgress: number | null;
  /** Progress after easing inside an active segment. */
  readonly easedProgress: number | null;
  /** Continuous media time before frame snapping. */
  readonly requestedTime: number;
  /** Effective media time after optional frame snapping. */
  readonly targetTime: number;
}

/** An immutable, normalized timeline that can resolve positions repeatedly. */
export interface Timeline {
  /** Effective unit shared by every normalized segment. */
  readonly unit: ScrollUnit;
  /** Resolves one finite position without mutating timeline state. */
  resolve(position: number): TimelineResolution;
}

/** An independently observed scroll axis. */
export type AxisName = 'x' | 'y';

/** A DOM scroll source resolved only when a controller mounts. */
export type ScrollSource = Document | HTMLElement;

/** A direct, selected, or lazily resolved scroll source. */
export type ScrollSourceReference = ScrollSource | string | (() => ScrollSource | null);

/** One named timeline controlled by a scroll axis. */
export interface FrameByFrameBindingConfig extends TimelineOptions {
  /** Unique binding ID within one controller. */
  readonly id: string;
}

/** Configuration for one independent scroll axis. */
export interface FrameByFrameAxisConfig {
  /** Whether this axis participates in updates; defaults to true. */
  readonly enabled?: boolean;
  /** Non-empty timeline bindings driven by this axis. */
  readonly bindings: readonly FrameByFrameBindingConfig[];
}

/** Horizontal and vertical controller configuration. */
export interface FrameByFrameAxesConfig {
  readonly x?: false | FrameByFrameAxisConfig;
  readonly y?: false | FrameByFrameAxisConfig;
}

/** Configuration captured by `createFrameByFrame`. */
export interface FrameByFrameOptions {
  /** Scroll source resolved during mount; omission selects the document. */
  readonly source?: ScrollSourceReference;
  /** At least one configured axis with one binding is required. */
  readonly axes: FrameByFrameAxesConfig;
}

/** Controller lifecycle states. */
export type FrameByFrameStatus = 'idle' | 'mounting' | 'ready' | 'disabled' | 'error' | 'destroyed';

/** Read-only public shape of package errors stored in state and events. */
export interface FrameByFrameErrorInfo extends Error {
  readonly name: 'FrameByFrameError';
  readonly code: FrameByFrameErrorCode;
  readonly cause: unknown;
  readonly details: FrameByFrameErrorDetails | undefined;
}

/** Last observed metrics for one axis. */
export interface FrameByFrameAxisState {
  readonly enabled: boolean;
  readonly offset: number;
  readonly max: number;
  readonly progress: number;
}

/** Last timeline resolution for one binding. */
export interface FrameByFrameBindingState {
  readonly id: string;
  readonly axis: AxisName;
  readonly resolution: TimelineResolution | null;
}

/** Detached controller state for debugging and framework integration. */
export interface FrameByFrameState {
  readonly status: FrameByFrameStatus;
  readonly enabled: boolean;
  readonly source: ScrollSource | null;
  readonly activeBreakpoints: readonly string[];
  readonly axes: Readonly<Partial<Record<AxisName, FrameByFrameAxisState>>>;
  readonly bindings: Readonly<Record<string, FrameByFrameBindingState>>;
  readonly lastError: FrameByFrameErrorInfo | null;
}

/** Why the controller published an update snapshot. */
export type FrameByFrameUpdateReason = 'mount' | 'scroll' | 'refresh' | 'enable' | 'disable';

/** Payload emitted after one coalesced controller update. */
export interface FrameByFrameUpdateEvent {
  readonly reason: FrameByFrameUpdateReason;
  readonly state: FrameByFrameState;
}

/** Public event payloads available in the controller foundation. */
export interface FrameByFrameEventMap {
  readonly mount: FrameByFrameState;
  readonly update: FrameByFrameUpdateEvent;
  readonly error: FrameByFrameErrorInfo;
  readonly destroy: FrameByFrameState;
}

/** Framework-independent controller lifecycle and state API. */
export interface FrameByFrameController {
  mount(): Promise<void>;
  refresh(): void;
  enable(): void;
  disable(): void;
  getState(): FrameByFrameState;
  on<EventName extends keyof FrameByFrameEventMap>(
    event: EventName,
    listener: (payload: FrameByFrameEventMap[EventName]) => void,
  ): () => void;
  destroy(): void;
}

/** Stable error codes currently emitted by the public package APIs. */
export type FrameByFrameErrorCode =
  | 'INVALID_TIMELINE'
  | 'INVALID_SEGMENT'
  | 'OVERLAPPING_SEGMENTS'
  | 'INVALID_FRAME_RATE'
  | 'INVALID_EASING_RESULT'
  | 'INVALID_CONTROLLER'
  | 'DUPLICATE_BINDING_ID'
  | 'ENVIRONMENT_UNAVAILABLE'
  | 'SOURCE_NOT_FOUND'
  | 'INVALID_LIFECYCLE_OPERATION'
  | 'CONTROLLER_DESTROYED';

/** Structured context attached to a `FrameByFrameError`. */
export type FrameByFrameErrorDetails = Readonly<Record<string, unknown>>;

/** Optional metadata accepted by `FrameByFrameError`. */
export interface FrameByFrameErrorOptions {
  /** Original failure that caused this package error. */
  readonly cause?: unknown;
  /** Package-owned read-only copy of structured diagnostic values. */
  readonly details?: FrameByFrameErrorDetails;
}
