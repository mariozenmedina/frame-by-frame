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

/** Stable error codes currently emitted by the pure timeline engine. */
export type FrameByFrameErrorCode =
  | 'INVALID_TIMELINE'
  | 'INVALID_SEGMENT'
  | 'OVERLAPPING_SEGMENTS'
  | 'INVALID_FRAME_RATE'
  | 'INVALID_EASING_RESULT';

/** Structured context attached to a `FrameByFrameError`. */
export type FrameByFrameErrorDetails = Readonly<Record<string, unknown>>;

/** Optional metadata accepted by `FrameByFrameError`. */
export interface FrameByFrameErrorOptions {
  /** Original failure that caused this package error. */
  readonly cause?: unknown;
  /** Package-owned read-only copy of structured diagnostic values. */
  readonly details?: FrameByFrameErrorDetails;
}
