import { FrameByFrameError } from '../core/errors.js';

import type {
  ControllerBindingConfig,
  ControllerVideoClipConfig,
  ControllerVideoSourceConfig,
} from '../core/controller-config.js';
import type { ResolvedVideoTarget } from './video-target.js';
import type { TimelineResolution, VideoLoadState } from '../types.js';

interface DesiredMediaTarget {
  readonly clipId: string;
  readonly requestedTime: number;
  readonly targetTime: number;
}

interface VideoFrameMetadataLike {
  readonly mediaTime?: number;
  readonly expectedDisplayTime?: number;
  readonly width?: number;
  readonly height?: number;
}

interface VideoFrameTarget {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

interface TargetSnapshot {
  readonly attributes: Readonly<Record<string, string | null>>;
  readonly srcObject: unknown;
  readonly muted: boolean;
  readonly defaultMuted: boolean;
  readonly playsInline: boolean;
  readonly controls: boolean;
  readonly loop: boolean;
  readonly autoplay: boolean;
}

interface LoadWaiter {
  readonly resolve: () => void;
  readonly reject: (error: FrameByFrameError) => void;
}

/** Detached media state consumed by controller snapshots. */
export interface VideoRendererState {
  readonly loadState: VideoLoadState;
  readonly activeClipId: string | null;
  readonly selectedSource: string | null;
  readonly duration: number | null;
  readonly appliedTime: number | null;
  readonly presentedTime: number | null;
  readonly seeking: boolean;
  readonly error: FrameByFrameError | null;
}

export type VideoRendererEvent =
  | {
      readonly type: 'loadstart';
      readonly clipId: string;
    }
  | {
      readonly type: 'loadedmetadata';
      readonly clipId: string;
      readonly duration: number | null;
    }
  | {
      readonly type: 'loadready';
      readonly clipId: string;
    }
  | {
      readonly type: 'seekrequest';
      readonly clipId: string;
      readonly requestedTime: number;
      readonly targetTime: number;
    }
  | {
      readonly type: 'frame';
      readonly clipId: string;
      readonly presentedTime: number;
      readonly expectedDisplayTime: number | null;
      readonly width: number | null;
      readonly height: number | null;
    }
  | {
      readonly type: 'error';
      readonly error: FrameByFrameError;
    };

export interface VideoRenderer {
  setResolution(resolution: TimelineResolution | null): void;
  load(): Promise<void>;
  unload(): void;
  getTarget(): HTMLVideoElement;
  getState(): VideoRendererState;
  destroy(): void;
}

export type VideoRendererFactory = (
  config: ControllerBindingConfig,
  onEvent: (event: VideoRendererEvent) => void,
) => VideoRenderer;

const SNAPSHOT_ATTRIBUTES = [
  'src',
  'preload',
  'poster',
  'crossorigin',
  'muted',
  'playsinline',
  'controls',
  'loop',
  'autoplay',
] as const;

const finiteOrNull = (value: number): number | null => (Number.isFinite(value) ? value : null);

const readDuration = (target: HTMLVideoElement): number | null => {
  const duration = finiteOrNull(target.duration);
  return duration === null ? null : Math.max(0, duration);
};

const snapshotTarget = (target: HTMLVideoElement): TargetSnapshot => {
  const attributes: Record<string, string | null> = {};

  for (const attribute of SNAPSHOT_ATTRIBUTES) {
    attributes[attribute] = target.getAttribute(attribute);
  }

  return {
    attributes: Object.freeze(attributes),
    srcObject: target.srcObject,
    muted: target.muted,
    defaultMuted: target.defaultMuted,
    playsInline: target.playsInline,
    controls: target.controls,
    loop: target.loop,
    autoplay: target.autoplay,
  };
};

const restoreTarget = (target: HTMLVideoElement, snapshot: TargetSnapshot): void => {
  for (const attribute of SNAPSHOT_ATTRIBUTES) {
    const value = snapshot.attributes[attribute];

    if (value === null || value === undefined) {
      target.removeAttribute(attribute);
    } else {
      target.setAttribute(attribute, value);
    }
  }

  target.srcObject = snapshot.srcObject as MediaProvider | null;
  target.muted = snapshot.muted;
  target.defaultMuted = snapshot.defaultMuted;
  target.playsInline = snapshot.playsInline;
  target.controls = snapshot.controls;
  target.loop = snapshot.loop;
  target.autoplay = snapshot.autoplay;

  try {
    target.load();
  } catch {
    // Restoration is best effort after every package-owned reference has been released.
  }
};

const configureTarget = (
  target: HTMLVideoElement,
  config: ControllerBindingConfig,
  owned: boolean,
): void => {
  target.pause();
  target.autoplay = false;

  if (owned) {
    const muted = config.video.muted ?? true;
    target.muted = muted;
    target.defaultMuted = muted;
    target.playsInline = config.video.playsInline ?? true;
    target.controls = config.video.controls ?? false;
    target.loop = config.video.loop ?? false;
    return;
  }

  if (config.video.muted !== undefined) {
    target.muted = config.video.muted;
    target.defaultMuted = config.video.muted;
  }

  if (config.video.playsInline !== undefined) {
    target.playsInline = config.video.playsInline;
  }

  if (config.video.controls !== undefined) {
    target.controls = config.video.controls;
  }

  if (config.video.loop !== undefined) {
    target.loop = config.video.loop;
  }
};

const createError = (
  code:
    'MEDIA_SOURCE_UNSUPPORTED' | 'MEDIA_LOAD_FAILED' | 'MEDIA_DECODE_FAILED' | 'MEDIA_SEEK_FAILED',
  message: string,
  bindingId: string,
  clipId: string | null,
  source: string | null,
  cause?: unknown,
): FrameByFrameError =>
  new FrameByFrameError(code, message, {
    cause,
    details: {
      bindingId,
      clipId,
      source,
    },
  });

class NativeVideoRenderer implements VideoRenderer {
  readonly #config: ControllerBindingConfig;
  readonly #handle: ResolvedVideoTarget;
  readonly #target: HTMLVideoElement;
  readonly #onEvent: (event: VideoRendererEvent) => void;
  readonly #snapshot: TargetSnapshot | null;
  readonly #waiters = new Set<LoadWaiter>();

  #loadState: VideoLoadState = 'idle';
  #activeClipId: string | null = null;
  #selectedSource: string | null = null;
  #duration: number | null = null;
  #appliedTime: number | null = null;
  #presentedTime: number | null = null;
  #seeking = false;
  #error: FrameByFrameError | null = null;
  #desired: DesiredMediaTarget | null = null;
  #autoLoad = true;
  #destroyed = false;
  #generation = 0;
  #candidateSources: readonly ControllerVideoSourceConfig[] = [];
  #candidateIndex = -1;
  #removeSourceListeners: (() => void) | null = null;
  #seekInFlight = false;
  #pendingSeek: DesiredMediaTarget | null = null;
  #frameHandle: number | null = null;
  #frameToken = 0;

  constructor(
    config: ControllerBindingConfig,
    handle: ResolvedVideoTarget,
    onEvent: (event: VideoRendererEvent) => void,
  ) {
    this.#config = config;
    this.#handle = handle;
    this.#target = handle.target;
    this.#onEvent = onEvent;
    this.#snapshot = handle.owned ? null : snapshotTarget(this.#target);
    configureTarget(this.#target, config, handle.owned);
  }

  setResolution(resolution: TimelineResolution | null): void {
    if (this.#destroyed || resolution === null) {
      return;
    }

    const clipId = resolution.clipId ?? this.#config.clips[0]?.id;

    if (clipId === undefined) {
      return;
    }

    const desired: DesiredMediaTarget = {
      clipId,
      requestedTime: resolution.requestedTime,
      targetTime: resolution.targetTime,
    };
    const clipChanged = this.#desired?.clipId !== clipId;
    this.#desired = desired;

    if (!this.#autoLoad || this.#loadState === 'unloaded') {
      return;
    }

    if (clipChanged || this.#activeClipId !== clipId || this.#loadState === 'idle') {
      this.#beginDesiredClip();
      return;
    }

    if (this.#loadState === 'metadata' || this.#loadState === 'ready') {
      this.#requestSeek(desired);
    }
  }

  load(): Promise<void> {
    this.#assertNotDestroyed();
    this.#autoLoad = true;

    if (this.#desired === null) {
      const soleClip = this.#config.clips[0];

      if (this.#config.clips.length !== 1 || soleClip === undefined) {
        return Promise.reject(
          createError(
            'MEDIA_LOAD_FAILED',
            'The binding has no currently resolved clip to load.',
            this.#config.id,
            null,
            null,
          ),
        );
      }

      this.#desired = { clipId: soleClip.id, requestedTime: 0, targetTime: 0 };
    }

    if (
      this.#activeClipId === this.#desired.clipId &&
      (this.#loadState === 'metadata' || this.#loadState === 'ready')
    ) {
      return Promise.resolve();
    }

    const promise = new Promise<void>((resolve, reject): void => {
      this.#waiters.add({ resolve, reject });
    });

    if (
      this.#activeClipId !== this.#desired.clipId ||
      this.#loadState === 'idle' ||
      this.#loadState === 'unloaded' ||
      this.#loadState === 'error'
    ) {
      this.#beginDesiredClip();
    }

    return promise;
  }

  unload(): void {
    this.#assertNotDestroyed();
    this.#autoLoad = false;
    this.#rejectWaiters(
      createError(
        'MEDIA_LOAD_FAILED',
        'Media loading was cancelled by unload().',
        this.#config.id,
        this.#activeClipId,
        this.#selectedSource,
      ),
    );
    this.#resetSource('unloaded');
  }

  getTarget(): HTMLVideoElement {
    this.#assertNotDestroyed();
    return this.#target;
  }

  getState(): VideoRendererState {
    return {
      loadState: this.#loadState,
      activeClipId: this.#activeClipId,
      selectedSource: this.#selectedSource,
      duration: this.#duration,
      appliedTime: this.#appliedTime,
      presentedTime: this.#presentedTime,
      seeking: this.#seeking,
      error: this.#error,
    };
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.#autoLoad = false;
    this.#rejectWaiters(
      new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller was destroyed while media was loading.',
        { details: { bindingId: this.#config.id } },
      ),
    );
    this.#resetSource('unloaded');

    try {
      if (this.#snapshot !== null) {
        restoreTarget(this.#target, this.#snapshot);
      }
    } finally {
      this.#handle.release();
    }
  }

  #beginDesiredClip(): void {
    const desired = this.#desired;

    if (desired === null) {
      return;
    }

    const clip = this.#config.clips.find((candidate) => candidate.id === desired.clipId);

    if (clip === undefined) {
      this.#fail(
        createError(
          'MEDIA_SOURCE_UNSUPPORTED',
          `Video clip "${desired.clipId}" is not configured.`,
          this.#config.id,
          desired.clipId,
          null,
        ),
      );
      return;
    }

    const candidates = clip.sources.filter((source) => {
      if (source.type === null) {
        return true;
      }

      try {
        return this.#target.canPlayType(source.type) !== '';
      } catch {
        return false;
      }
    });

    if (candidates.length === 0) {
      this.#fail(
        createError(
          'MEDIA_SOURCE_UNSUPPORTED',
          `No playable source is available for video clip "${clip.id}".`,
          this.#config.id,
          clip.id,
          null,
        ),
      );
      return;
    }

    this.#candidateSources = candidates;
    this.#candidateIndex = 0;
    this.#startCandidate(clip, candidates[0]);
  }

  #startCandidate(
    clip: ControllerVideoClipConfig,
    source: ControllerVideoSourceConfig | undefined,
  ): void {
    if (source === undefined || this.#destroyed) {
      return;
    }

    const generation = ++this.#generation;
    this.#cancelFrameObservation();
    this.#removeSourceListeners?.();
    this.#removeSourceListeners = null;
    this.#seekInFlight = false;
    this.#pendingSeek = null;
    this.#seeking = false;
    this.#activeClipId = clip.id;
    this.#selectedSource = source.src;
    this.#duration = null;
    this.#appliedTime = null;
    this.#presentedTime = null;
    this.#error = null;
    this.#loadState = 'loading';
    this.#attachSourceListeners(generation);
    this.#applyClipAttributes(clip);

    try {
      this.#target.pause();
      this.#target.srcObject = null;
      this.#target.setAttribute('src', source.src);
      this.#target.load();
      this.#emit({ type: 'loadstart', clipId: clip.id });
    } catch (cause) {
      this.#handleSourceFailure(generation, cause);
    }
  }

  #applyClipAttributes(clip: ControllerVideoClipConfig): void {
    this.#target.preload = clip.preload;

    if (clip.poster === null) {
      this.#target.removeAttribute('poster');
    } else {
      this.#target.poster = clip.poster;
    }

    if (clip.crossOrigin === null) {
      this.#target.removeAttribute('crossorigin');
    } else {
      this.#target.crossOrigin = clip.crossOrigin;
    }
  }

  #attachSourceListeners(generation: number): void {
    const loadedMetadata = (): void => {
      if (this.#isCurrentGeneration(generation)) {
        this.#handleLoadedMetadata();
      }
    };
    const loadedData = (): void => {
      if (this.#isCurrentGeneration(generation)) {
        this.#handleLoadedData();
      }
    };
    const seeked = (): void => {
      if (this.#isCurrentGeneration(generation)) {
        this.#handleSeeked();
      }
    };
    const error = (): void => {
      if (this.#isCurrentGeneration(generation)) {
        this.#handleSourceFailure(generation, this.#target.error);
      }
    };

    this.#target.addEventListener('loadedmetadata', loadedMetadata);
    this.#target.addEventListener('loadeddata', loadedData);
    this.#target.addEventListener('seeked', seeked);
    this.#target.addEventListener('error', error);

    this.#removeSourceListeners = (): void => {
      this.#target.removeEventListener('loadedmetadata', loadedMetadata);
      this.#target.removeEventListener('loadeddata', loadedData);
      this.#target.removeEventListener('seeked', seeked);
      this.#target.removeEventListener('error', error);
    };
  }

  #handleLoadedMetadata(): void {
    const clipId = this.#activeClipId;

    if (clipId === null) {
      return;
    }

    this.#duration = readDuration(this.#target);
    this.#loadState = 'metadata';
    this.#error = null;
    this.#emit({ type: 'loadedmetadata', clipId, duration: this.#duration });
    this.#resolveWaiters();

    if (this.#desired?.clipId === clipId) {
      this.#requestSeek(this.#desired);
    }
  }

  #handleLoadedData(): void {
    const clipId = this.#activeClipId;

    if (clipId === null) {
      return;
    }

    this.#loadState = 'ready';
    this.#emit({ type: 'loadready', clipId });

    if (this.#supportsVideoFrameCallback()) {
      this.#scheduleFrameObservation();
    } else if (!this.#seekInFlight) {
      this.#presentFrame(this.#target.currentTime, null, null, null);
    }
  }

  #handleSeeked(): void {
    this.#seekInFlight = false;
    this.#seeking = false;

    if (!this.#supportsVideoFrameCallback()) {
      this.#presentFrame(this.#target.currentTime, null, null, null);
    }

    const pending = this.#pendingSeek;
    this.#pendingSeek = null;

    if (pending !== null && pending.clipId === this.#activeClipId) {
      this.#requestSeek(pending);
    }
  }

  #requestSeek(desired: DesiredMediaTarget): void {
    if (desired.clipId !== this.#activeClipId || this.#loadState === 'loading') {
      return;
    }

    const targetTime =
      this.#duration === null
        ? Math.max(0, desired.targetTime)
        : Math.min(this.#duration, Math.max(0, desired.targetTime));
    const normalized = { ...desired, targetTime };
    const reference =
      this.#pendingSeek?.targetTime ?? this.#appliedTime ?? this.#target.currentTime;

    if (Math.abs(reference - targetTime) <= this.#config.timeEpsilon) {
      return;
    }

    if (this.#seekInFlight) {
      this.#pendingSeek = normalized;
      return;
    }

    this.#applySeek(normalized);
  }

  #applySeek(desired: DesiredMediaTarget): void {
    try {
      this.#target.currentTime = desired.targetTime;
      this.#appliedTime = desired.targetTime;
      this.#seekInFlight = true;
      this.#seeking = true;
      this.#emit({
        type: 'seekrequest',
        clipId: desired.clipId,
        requestedTime: desired.requestedTime,
        targetTime: desired.targetTime,
      });
      this.#scheduleFrameObservation();
    } catch (cause) {
      this.#fail(
        createError(
          'MEDIA_SEEK_FAILED',
          'The native video target rejected a seek request.',
          this.#config.id,
          desired.clipId,
          this.#selectedSource,
          cause,
        ),
      );
    }
  }

  #scheduleFrameObservation(): void {
    if (!this.#supportsVideoFrameCallback() || this.#activeClipId === null) {
      return;
    }

    this.#cancelFrameObservation();
    const generation = this.#generation;
    const token = ++this.#frameToken;
    const request = (this.#target as unknown as VideoFrameTarget).requestVideoFrameCallback;

    if (request === undefined) {
      return;
    }

    this.#frameHandle = request.call(this.#target, (_now, metadata): void => {
      if (
        this.#destroyed ||
        generation !== this.#generation ||
        token !== this.#frameToken ||
        this.#activeClipId === null
      ) {
        return;
      }

      this.#frameHandle = null;
      const presentedTime =
        typeof metadata.mediaTime === 'number' && Number.isFinite(metadata.mediaTime)
          ? metadata.mediaTime
          : this.#target.currentTime;
      this.#presentFrame(
        presentedTime,
        finiteOrNull(metadata.expectedDisplayTime ?? Number.NaN),
        finiteOrNull(metadata.width ?? Number.NaN),
        finiteOrNull(metadata.height ?? Number.NaN),
      );
    });
  }

  #presentFrame(
    presentedTime: number,
    expectedDisplayTime: number | null,
    width: number | null,
    height: number | null,
  ): void {
    const clipId = this.#activeClipId;

    if (clipId === null || !Number.isFinite(presentedTime)) {
      return;
    }

    this.#presentedTime = presentedTime;
    this.#emit({
      type: 'frame',
      clipId,
      presentedTime,
      expectedDisplayTime,
      width,
      height,
    });
  }

  #handleSourceFailure(generation: number, cause: unknown): void {
    if (!this.#isCurrentGeneration(generation)) {
      return;
    }

    const nextIndex = this.#candidateIndex + 1;
    const desiredClip = this.#activeClipId;
    const clip = this.#config.clips.find((candidate) => candidate.id === desiredClip);

    if (clip !== undefined && nextIndex < this.#candidateSources.length) {
      this.#candidateIndex = nextIndex;
      this.#startCandidate(clip, this.#candidateSources[nextIndex]);
      return;
    }

    const mediaErrorCode = this.#target.error?.code;
    const code =
      mediaErrorCode === 3
        ? 'MEDIA_DECODE_FAILED'
        : mediaErrorCode === 4
          ? 'MEDIA_SOURCE_UNSUPPORTED'
          : 'MEDIA_LOAD_FAILED';
    this.#fail(
      createError(
        code,
        code === 'MEDIA_DECODE_FAILED'
          ? 'The browser could not decode the selected video clip.'
          : code === 'MEDIA_SOURCE_UNSUPPORTED'
            ? 'The browser could not use any source for the selected video clip.'
            : 'The selected video clip failed to load.',
        this.#config.id,
        this.#activeClipId,
        this.#selectedSource,
        cause,
      ),
    );
  }

  #fail(error: FrameByFrameError): void {
    ++this.#generation;
    this.#cancelFrameObservation();
    this.#removeSourceListeners?.();
    this.#removeSourceListeners = null;
    this.#seekInFlight = false;
    this.#pendingSeek = null;
    this.#seeking = false;
    this.#loadState = 'error';
    this.#error = error;
    this.#rejectWaiters(error);
    this.#emit({ type: 'error', error });
  }

  #resetSource(loadState: 'unloaded'): void {
    ++this.#generation;
    this.#cancelFrameObservation();
    this.#removeSourceListeners?.();
    this.#removeSourceListeners = null;
    this.#seekInFlight = false;
    this.#pendingSeek = null;
    this.#seeking = false;
    this.#activeClipId = null;
    this.#selectedSource = null;
    this.#duration = null;
    this.#appliedTime = null;
    this.#presentedTime = null;
    this.#error = null;
    this.#loadState = loadState;

    try {
      this.#target.pause();
      this.#target.srcObject = null;
      this.#target.removeAttribute('src');
      this.#target.load();
    } catch {
      // Cleanup remains idempotent even if a custom element-like target rejects load().
    }
  }

  #supportsVideoFrameCallback(): boolean {
    return (
      typeof (this.#target as unknown as VideoFrameTarget).requestVideoFrameCallback === 'function'
    );
  }

  #cancelFrameObservation(): void {
    ++this.#frameToken;

    if (this.#frameHandle === null) {
      return;
    }

    try {
      const cancel = (this.#target as unknown as VideoFrameTarget).cancelVideoFrameCallback;

      if (cancel !== undefined) {
        cancel.call(this.#target, this.#frameHandle);
      }
    } catch {
      // The generation token still invalidates a callback that cannot be cancelled.
    }

    this.#frameHandle = null;
  }

  #resolveWaiters(): void {
    for (const waiter of this.#waiters) {
      waiter.resolve();
    }

    this.#waiters.clear();
  }

  #rejectWaiters(error: FrameByFrameError): void {
    for (const waiter of this.#waiters) {
      waiter.reject(error);
    }

    this.#waiters.clear();
  }

  #emit(event: VideoRendererEvent): void {
    if (!this.#destroyed) {
      this.#onEvent(event);
    }
  }

  #isCurrentGeneration(generation: number): boolean {
    return !this.#destroyed && generation === this.#generation;
  }

  #assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The video renderer has already been destroyed.',
        { details: { bindingId: this.#config.id } },
      );
    }
  }
}

/** Creates one native video renderer around an already resolved and claimed target. */
export const createNativeVideoRenderer = (
  config: ControllerBindingConfig,
  handle: ResolvedVideoTarget,
  onEvent: (event: VideoRendererEvent) => void,
): VideoRenderer => new NativeVideoRenderer(config, handle, onEvent);
