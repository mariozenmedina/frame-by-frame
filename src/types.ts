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

/** A direct, selected, or lazily resolved DOM element. */
export type ElementReference<T extends Element = HTMLElement> = T | string | (() => T | null);

/** The native renderer implemented by the current package stage. */
export type RendererType = 'video';

/** Native hints plus explicit package-managed full-file preload. */
export type VideoPreload = 'none' | 'metadata' | 'auto' | 'full';

/** Events that may activate an on-demand media binding. */
export type VideoLoadingTrigger = 'manual' | 'target-near-viewport' | 'first-use';

/** Loading policy shared by the clips in one binding. */
export type VideoLoadingConfig =
  | {
      /** Immediate loading is the default policy. */
      readonly mode?: 'immediate';
      readonly trigger?: never;
      readonly rootMargin?: never;
      /** Fetch credentials used only by clips configured with preload full. */
      readonly credentials?: RequestCredentials;
      /** Fetch cache mode used only by clips configured with preload full. */
      readonly cache?: RequestCache;
    }
  | {
      readonly mode: 'on-demand';
      readonly trigger: 'target-near-viewport';
      /** IntersectionObserver root margin; defaults to 0px. */
      readonly rootMargin?: string;
      readonly credentials?: RequestCredentials;
      readonly cache?: RequestCache;
    }
  | {
      readonly mode: 'on-demand';
      readonly trigger: 'manual' | 'first-use';
      readonly rootMargin?: never;
      readonly credentials?: RequestCredentials;
      readonly cache?: RequestCache;
    };

/** Valid values for the media element crossorigin attribute. */
export type MediaCrossOrigin = '' | 'anonymous' | 'use-credentials';

/** One ordered candidate for a video clip. */
export interface VideoSourceConfig {
  /** URL assigned to the video element when this candidate is selected. */
  readonly src: string;
  /** Optional MIME type, including codecs when known. */
  readonly type?: string;
}

/** One logical media asset that timeline segments may select by ID. */
export interface VideoClipConfig {
  /** Unique clip ID within one binding. */
  readonly id: string;
  /** Ordered source candidates for the same content. */
  readonly sources: readonly VideoSourceConfig[];
  /** Optional poster applied while this clip is active. */
  readonly poster?: string;
  /** Optional CORS mode applied before the selected source. */
  readonly crossOrigin?: MediaCrossOrigin;
  /** Native preload hint; defaults to metadata. */
  readonly preload?: VideoPreload;
}

/** Property overrides for a supplied or package-created video target. */
export interface VideoRendererConfig {
  readonly muted?: boolean;
  readonly playsInline?: boolean;
  readonly controls?: boolean;
  readonly loop?: boolean;
}

/** Bounded native seek scheduling options. */
export interface VideoSeekConfig {
  /** Smallest meaningful target-time change in seconds; defaults to 0.001. */
  readonly timeEpsilon?: number;
}

/** Timeline and video configuration shared by both target ownership modes. */
export interface FrameByFrameBindingBaseConfig extends TimelineOptions {
  /** Unique binding ID within one controller. */
  readonly id: string;
  /** Native video is the default and only renderer in this stage. */
  readonly renderer?: 'video';
  /** Non-empty logical clips referenced by timeline segments. */
  readonly clips: readonly VideoClipConfig[];
  /** Binding-level eager or on-demand loading policy. */
  readonly loading?: VideoLoadingConfig;
  /** Optional video property overrides. */
  readonly video?: VideoRendererConfig;
  /** Optional native seek scheduler settings. */
  readonly seek?: VideoSeekConfig;
}

/** One named video timeline controlled by a scroll axis. */
export type FrameByFrameBindingConfig = FrameByFrameBindingBaseConfig &
  (
    | {
        /** Existing video target resolved during mount. */
        readonly target: ElementReference<HTMLVideoElement>;
        readonly mountTo?: never;
      }
    | {
        readonly target?: never;
        /** Container where the package creates and owns a video target. */
        readonly mountTo: ElementReference;
      }
  );

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

/** Timeline and media fields that a responsive breakpoint may replace or merge. */
export interface FrameByFrameBindingOverride {
  /** Existing binding ID selected for this override. */
  readonly id: string;
  /** Replaces the binding's complete segment collection. */
  readonly segments?: readonly TimelineSegment[];
  /** Replaces the binding's complete clip collection. */
  readonly clips?: readonly VideoClipConfig[];
  /** Overrides the timeline-level easing default. */
  readonly easing?: Easing;
  /** Shallowly overrides frame snapping options. */
  readonly frame?: FrameConfig;
  /** Shallowly overrides loading options. */
  readonly loading?: VideoLoadingConfig;
  /** Shallowly overrides native video properties. */
  readonly video?: VideoRendererConfig;
  /** Shallowly overrides native seek options. */
  readonly seek?: VideoSeekConfig;
}

/** Responsive changes for one existing controller axis. */
export interface FrameByFrameAxisOverride {
  /** Disables or re-enables the axis without removing its bindings. */
  readonly enabled?: boolean;
  /** Overrides merged into existing bindings by stable ID. */
  readonly bindings?: readonly FrameByFrameBindingOverride[];
}

/** Responsive changes scoped to existing axes and bindings. */
export interface FrameByFrameBreakpointOverride {
  readonly axes: {
    readonly x?: false | FrameByFrameAxisOverride;
    readonly y?: false | FrameByFrameAxisOverride;
  };
}

/** One ordered media-query override in the responsive cascade. */
export interface FrameByFrameBreakpointConfig {
  /** Unique stable ID exposed by controller state and events. */
  readonly id: string;
  /** Media query evaluated only after mount. */
  readonly query: string;
  /** Partial configuration applied while the query matches. */
  readonly override: FrameByFrameBreakpointOverride;
}

/** How an active reduced-motion preference affects media bindings. */
export type ReducedMotionBehavior = 'first-frame' | 'last-frame' | 'disable' | 'ignore';

/** Configuration captured by `createFrameByFrame`. */
export interface FrameByFrameOptions {
  /** Scroll source resolved during mount; omission selects the document. */
  readonly source?: ScrollSourceReference;
  /** At least one configured axis with one binding is required. */
  readonly axes: FrameByFrameAxesConfig;
  /** Ordered responsive overrides; later matching entries win. */
  readonly breakpoints?: readonly FrameByFrameBreakpointConfig[];
  /** Reduced-motion behavior; defaults to first-frame. */
  readonly reducedMotion?: ReducedMotionBehavior;
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
  readonly renderer: RendererType;
  readonly loadState: VideoLoadState;
  /** Full-preload progress keyed by clip ID. */
  readonly loadProgress: Readonly<Record<string, VideoLoadProgress>>;
  readonly activeClipId: string | null;
  readonly selectedSource: string | null;
  readonly duration: number | null;
  readonly appliedTime: number | null;
  readonly presentedTime: number | null;
  readonly seeking: boolean;
  readonly error: FrameByFrameErrorInfo | null;
}

/** Native media readiness for a controller binding. */
export type VideoLoadState = 'idle' | 'loading' | 'metadata' | 'ready' | 'error' | 'unloaded';

/** Byte progress for one explicit full-file preload. */
export interface VideoLoadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
  readonly ratio: number | null;
}

/** Detached controller state for debugging and framework integration. */
export interface FrameByFrameState {
  readonly status: FrameByFrameStatus;
  readonly enabled: boolean;
  readonly source: ScrollSource | null;
  readonly activeBreakpoints: readonly string[];
  readonly prefersReducedMotion: boolean;
  readonly axes: Readonly<Partial<Record<AxisName, FrameByFrameAxisState>>>;
  readonly bindings: Readonly<Record<string, FrameByFrameBindingState>>;
  readonly lastError: FrameByFrameErrorInfo | null;
}

/** Why the controller published an update snapshot. */
export type FrameByFrameUpdateReason =
  | 'mount'
  | 'scroll'
  | 'refresh'
  | 'enable'
  | 'disable'
  | 'breakpoint'
  | 'preference'
  | 'resize'
  | 'visibility';

/** Payload emitted after one coalesced controller update. */
export interface FrameByFrameUpdateEvent {
  readonly reason: FrameByFrameUpdateReason;
  readonly state: FrameByFrameState;
}

/** Payload emitted after the active responsive cascade changes successfully. */
export interface FrameByFrameBreakpointChangeEvent {
  readonly previous: readonly string[];
  readonly current: readonly string[];
  readonly state: FrameByFrameState;
}

/** Shared identity and state included by media lifecycle events. */
export interface FrameByFrameBindingEvent {
  readonly bindingId: string;
  readonly clipId: string;
  readonly state: FrameByFrameState;
}

/** Metadata became available for the selected clip. */
export interface FrameByFrameLoadedMetadataEvent extends FrameByFrameBindingEvent {
  readonly duration: number | null;
}

/** Full-file preload progress for one binding clip. */
export interface FrameByFrameLoadProgressEvent extends FrameByFrameBindingEvent {
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
  readonly ratio: number | null;
}

/** A meaningful seek was submitted to the native video target. */
export interface FrameByFrameSeekRequestEvent extends FrameByFrameBindingEvent {
  readonly requestedTime: number;
  readonly targetTime: number;
}

/** A frame was observed at or near browser composition. */
export interface FrameByFrameFrameEvent extends FrameByFrameBindingEvent {
  readonly presentedTime: number;
  readonly expectedDisplayTime: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

/** Public event payloads available in the controller foundation. */
export interface FrameByFrameEventMap {
  readonly mount: FrameByFrameState;
  readonly update: FrameByFrameUpdateEvent;
  readonly breakpointchange: FrameByFrameBreakpointChangeEvent;
  readonly loadstart: FrameByFrameBindingEvent;
  readonly loadprogress: FrameByFrameLoadProgressEvent;
  readonly loadedmetadata: FrameByFrameLoadedMetadataEvent;
  readonly loadready: FrameByFrameBindingEvent;
  readonly seekrequest: FrameByFrameSeekRequestEvent;
  readonly frame: FrameByFrameFrameEvent;
  readonly error: FrameByFrameErrorInfo;
  readonly destroy: FrameByFrameState;
}

/** Framework-independent controller lifecycle and state API. */
export interface FrameByFrameController {
  mount(): Promise<void>;
  refresh(): void;
  enable(): void;
  disable(): void;
  load(bindingId?: string): Promise<void>;
  /** Waits for the latest automatically scheduled media readiness cycle. */
  whenReady(): Promise<FrameByFrameState>;
  unload(bindingId?: string): void;
  getTarget(bindingId: string): HTMLVideoElement | null;
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
  | 'INVALID_BREAKPOINT_CONFIG'
  | 'DUPLICATE_BINDING_ID'
  | 'ENVIRONMENT_UNAVAILABLE'
  | 'SOURCE_NOT_FOUND'
  | 'INVALID_LIFECYCLE_OPERATION'
  | 'CONTROLLER_DESTROYED'
  | 'INVALID_MEDIA_CONFIG'
  | 'TARGET_NOT_FOUND'
  | 'INVALID_TARGET_TYPE'
  | 'TARGET_CONFLICT'
  | 'MEDIA_SOURCE_UNSUPPORTED'
  | 'MEDIA_LOAD_FAILED'
  | 'FULL_PRELOAD_FAILED'
  | 'MEDIA_DECODE_FAILED'
  | 'MEDIA_SEEK_FAILED';

/** Structured context attached to a `FrameByFrameError`. */
export type FrameByFrameErrorDetails = Readonly<Record<string, unknown>>;

/** Optional metadata accepted by `FrameByFrameError`. */
export interface FrameByFrameErrorOptions {
  /** Original failure that caused this package error. */
  readonly cause?: unknown;
  /** Package-owned read-only copy of structured diagnostic values. */
  readonly details?: FrameByFrameErrorDetails;
}
