import { FrameByFrameError } from '../core/errors.js';
import { AssetCache } from './asset-cache.js';

import type {
  ControllerBindingConfig,
  ControllerVideoClipConfig,
  ControllerVideoSourceConfig,
} from '../core/controller-config.js';
import type { ResolvedVideoTarget } from './video-target.js';
import type { AssetConsumer, AssetLoadProgress, LoadedAsset } from './asset-cache.js';
import type { TimelineResolution, VideoLoadProgress, VideoLoadState } from '../types.js';

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

interface ReadinessWaiter extends LoadWaiter {
  readonly clipId: string;
  readonly state: 'metadata' | 'ready';
}

interface PreparedFullAsset {
  readonly asset: LoadedAsset;
  readonly source: ControllerVideoSourceConfig;
  readonly sourceIndex: number;
}

interface FullAssetPreparation {
  readonly clipId: string;
  consumer: AssetConsumer | null;
  result: Promise<PreparedFullAsset>;
}

export interface VideoRendererDependencies {
  readonly assetCache: AssetCache;
  readonly resolveUrl: (source: string, target: HTMLVideoElement) => string;
  readonly observeNearViewport: (
    target: HTMLVideoElement,
    rootMargin: string,
    onEnter: () => void,
  ) => () => void;
}

/** Detached media state consumed by controller snapshots. */
export interface VideoRendererState {
  readonly loadState: VideoLoadState;
  readonly loadProgress: Readonly<Record<string, VideoLoadProgress>>;
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
      readonly type: 'loadprogress';
      readonly clipId: string;
      readonly progress: VideoLoadProgress;
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
  prepareConfig(config: ControllerBindingConfig): VideoRendererConfigTransaction;
  setActivity(activity: VideoRendererActivity): void;
  setResolution(resolution: TimelineResolution | null): void;
  load(): Promise<void>;
  whenReady(): Promise<void>;
  unload(): void;
  getTarget(): HTMLVideoElement;
  getState(): VideoRendererState;
  destroy(): void;
}

export type VideoRendererActivity = 'active' | 'suspended' | 'disabled';

export interface VideoRendererConfigTransaction {
  commit(): void;
  cancel(): void;
}

export type VideoRendererFactory = (
  config: ControllerBindingConfig,
  onEvent: (event: VideoRendererEvent) => void,
  activity?: VideoRendererActivity,
) => VideoRenderer;

const defaultAssetCache = new AssetCache({
  fetch: (url, init) => globalThis.fetch(url, init),
  createObjectURL: (blob) => globalThis.URL.createObjectURL(blob),
  revokeObjectURL: (url) => {
    globalThis.URL.revokeObjectURL(url);
  },
});

const defaultDependencies: VideoRendererDependencies = {
  assetCache: defaultAssetCache,
  resolveUrl: (source, target) => {
    return new URL(source, target.ownerDocument.baseURI).href;
  },
  observeNearViewport: (target, rootMargin, onEnter) => {
    if (typeof globalThis.IntersectionObserver !== 'function') {
      throw new FrameByFrameError(
        'ENVIRONMENT_UNAVAILABLE',
        'IntersectionObserver is required by target-near-viewport loading.',
      );
    }

    const observer = new globalThis.IntersectionObserver(
      (entries): void => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onEnter();
        }
      },
      { root: null, rootMargin },
    );
    observer.observe(target);
    return (): void => {
      observer.disconnect();
    };
  },
};

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

const restoreTargetConfiguration = (target: HTMLVideoElement, snapshot: TargetSnapshot): void => {
  for (const attribute of SNAPSHOT_ATTRIBUTES) {
    if (attribute === 'src') {
      continue;
    }

    const value = snapshot.attributes[attribute];

    if (value === null || value === undefined) {
      target.removeAttribute(attribute);
    } else {
      target.setAttribute(attribute, value);
    }
  }

  target.muted = snapshot.muted;
  target.defaultMuted = snapshot.defaultMuted;
  target.playsInline = snapshot.playsInline;
  target.controls = snapshot.controls;
  target.loop = snapshot.loop;
  target.autoplay = snapshot.autoplay;
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
    | 'MEDIA_SOURCE_UNSUPPORTED'
    | 'MEDIA_LOAD_FAILED'
    | 'MEDIA_DECODE_FAILED'
    | 'MEDIA_SEEK_FAILED'
    | 'FULL_PRELOAD_FAILED',
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
  #config: ControllerBindingConfig;
  readonly #handle: ResolvedVideoTarget;
  readonly #target: HTMLVideoElement;
  readonly #onEvent: (event: VideoRendererEvent) => void;
  readonly #snapshot: TargetSnapshot | null;
  readonly #waiters = new Set<LoadWaiter>();
  readonly #readinessWaiters = new Set<ReadinessWaiter>();
  readonly #dependencies: VideoRendererDependencies;
  readonly #fullAssets = new Map<string, FullAssetPreparation>();
  readonly #loadProgress = new Map<string, VideoLoadProgress>();

  #loadState: VideoLoadState = 'idle';
  #activeClipId: string | null = null;
  #selectedSource: string | null = null;
  #duration: number | null = null;
  #appliedTime: number | null = null;
  #presentedTime: number | null = null;
  #seeking = false;
  #error: FrameByFrameError | null = null;
  #desired: DesiredMediaTarget | null = null;
  #autoLoad: boolean;
  #destroyed = false;
  #generation = 0;
  #candidateSources: readonly ControllerVideoSourceConfig[] = [];
  #candidateIndex = -1;
  #removeSourceListeners: (() => void) | null = null;
  #seekInFlight = false;
  #pendingSeek: DesiredMediaTarget | null = null;
  #frameHandle: number | null = null;
  #frameToken = 0;
  #readinessGeneration = 0;
  #stopObserving: (() => void) | null = null;
  #activity: VideoRendererActivity = 'active';
  #manualUnload = false;

  constructor(
    config: ControllerBindingConfig,
    handle: ResolvedVideoTarget,
    onEvent: (event: VideoRendererEvent) => void,
    dependencies: VideoRendererDependencies,
    activity: VideoRendererActivity,
  ) {
    this.#config = config;
    this.#handle = handle;
    this.#target = handle.target;
    this.#onEvent = onEvent;
    this.#dependencies = dependencies;
    this.#activity = activity;
    this.#snapshot = handle.owned ? null : snapshotTarget(this.#target);
    configureTarget(this.#target, config, handle.owned);
    this.#autoLoad = activity === 'active' && config.loading.mode === 'immediate';

    if (this.#autoLoad) {
      this.#prepareAllFullClips();
    } else if (activity === 'active' && config.loading.trigger === 'target-near-viewport') {
      try {
        this.#stopObserving = dependencies.observeNearViewport(
          this.#target,
          config.loading.rootMargin ?? '0px',
          (): void => {
            this.#activate(true, true);
          },
        );
      } catch (cause) {
        throw cause instanceof FrameByFrameError
          ? cause
          : new FrameByFrameError(
              'ENVIRONMENT_UNAVAILABLE',
              'The target-near-viewport observer could not be created.',
              { cause, details: { bindingId: config.id } },
            );
      }
    }
  }

  prepareConfig(config: ControllerBindingConfig): VideoRendererConfigTransaction {
    this.#assertNotDestroyed();

    if (
      config.id !== this.#config.id ||
      config.axis !== this.#config.axis ||
      config.target !== this.#config.target ||
      config.mountTo !== this.#config.mountTo
    ) {
      throw new FrameByFrameError(
        'INVALID_BREAKPOINT_CONFIG',
        'Responsive overrides cannot change binding identity, axis, or target ownership.',
        { details: { bindingId: this.#config.id } },
      );
    }

    let committed = false;
    let enteredBeforeCommit = false;
    let candidateObserver: (() => void) | null = null;

    if (
      this.#activity === 'active' &&
      config.loading.mode === 'on-demand' &&
      config.loading.trigger === 'target-near-viewport'
    ) {
      candidateObserver = this.#observeNearViewport(config, (): void => {
        if (committed) {
          this.#activate(true, true);
        } else {
          enteredBeforeCommit = true;
        }
      });
    }

    let settled = false;

    return {
      commit: (): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.#stopObserving?.();
        this.#stopObserving = null;
        this.#rejectWaiters(
          createError(
            'MEDIA_LOAD_FAILED',
            'Media loading was superseded by a responsive configuration change.',
            this.#config.id,
            this.#activeClipId,
            this.#selectedSource,
          ),
        );
        this.#supersedeReadiness();
        this.#releaseFullAssets();
        this.#desired = null;
        this.#resetSource('idle');

        if (this.#snapshot !== null) {
          restoreTargetConfiguration(this.#target, this.#snapshot);
        }

        this.#config = config;
        configureTarget(this.#target, config, this.#handle.owned);
        this.#manualUnload = false;
        this.#autoLoad = this.#activity === 'active' && config.loading.mode === 'immediate';
        committed = true;

        if (this.#activity === 'active') {
          if (this.#autoLoad) {
            candidateObserver?.();
            candidateObserver = null;
            this.#prepareAllFullClips();
          } else {
            this.#stopObserving = candidateObserver;
            candidateObserver = null;

            if (enteredBeforeCommit) {
              this.#activate(true, true);
            }
          }
        } else {
          candidateObserver?.();
          candidateObserver = null;
        }
      },
      cancel: (): void => {
        if (settled) {
          return;
        }

        settled = true;
        candidateObserver?.();
        candidateObserver = null;
      },
    };
  }

  setActivity(activity: VideoRendererActivity): void {
    this.#assertNotDestroyed();

    if (activity === this.#activity) {
      return;
    }

    this.#activity = activity;

    if (activity === 'suspended') {
      this.#cancelFrameObservation();
      return;
    }

    if (activity === 'disabled') {
      this.#autoLoad = false;
      this.#stopObserving?.();
      this.#stopObserving = null;
      this.#rejectWaiters(
        createError(
          'MEDIA_LOAD_FAILED',
          'Media loading was cancelled by the active reduced-motion behavior.',
          this.#config.id,
          this.#activeClipId,
          this.#selectedSource,
        ),
      );
      this.#supersedeReadiness();
      this.#releaseFullAssets();
      this.#desired = null;
      this.#resetSource('unloaded');
      return;
    }

    if (this.#manualUnload) {
      return;
    }

    this.#startConfiguredLoadingPolicy();
  }

  setResolution(resolution: TimelineResolution | null): void {
    if (this.#destroyed || resolution === null || this.#activity === 'disabled') {
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

    if (this.#activity === 'suspended') {
      return;
    }

    if (
      !this.#autoLoad &&
      this.#config.loading.mode === 'on-demand' &&
      this.#config.loading.trigger === 'first-use' &&
      this.#loadState !== 'unloaded'
    ) {
      this.#activate(false, false);
    }

    if (clipChanged) {
      this.#supersedeReadiness();
    }

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
    this.#manualUnload = false;

    if (this.#activity === 'disabled') {
      return Promise.resolve();
    }

    if (this.#error?.code === 'FULL_PRELOAD_FAILED' && this.#desired !== null) {
      this.#discardFullAsset(this.#desired.clipId);
    }

    this.#activate(true);

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

  async whenReady(): Promise<void> {
    this.#assertNotDestroyed();

    for (;;) {
      const generation = this.#readinessGeneration;
      const tasks = this.#readinessTasks();
      await Promise.all(tasks);

      if (this.#destroyed) {
        throw new FrameByFrameError(
          'CONTROLLER_DESTROYED',
          'The controller was destroyed while media readiness was pending.',
          { details: { bindingId: this.#config.id } },
        );
      }

      if (generation === this.#readinessGeneration) {
        return;
      }
    }
  }

  unload(): void {
    this.#assertNotDestroyed();
    this.#manualUnload = true;
    this.#autoLoad = false;
    this.#stopObserving?.();
    this.#stopObserving = null;
    this.#rejectWaiters(
      createError(
        'MEDIA_LOAD_FAILED',
        'Media loading was cancelled by unload().',
        this.#config.id,
        this.#activeClipId,
        this.#selectedSource,
      ),
    );
    this.#supersedeReadiness();
    this.#releaseFullAssets();
    this.#resetSource('unloaded');
  }

  getTarget(): HTMLVideoElement {
    this.#assertNotDestroyed();
    return this.#target;
  }

  getState(): VideoRendererState {
    return {
      loadState: this.#loadState,
      loadProgress: Object.freeze(Object.fromEntries(this.#loadProgress)),
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
    this.#stopObserving?.();
    this.#stopObserving = null;
    this.#rejectWaiters(
      new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller was destroyed while media was loading.',
        { details: { bindingId: this.#config.id } },
      ),
    );
    this.#rejectReadinessWaiters(
      new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller was destroyed while media readiness was pending.',
        { details: { bindingId: this.#config.id } },
      ),
    );
    this.#releaseFullAssets();
    this.#resetSource('unloaded');

    try {
      if (this.#snapshot !== null) {
        restoreTarget(this.#target, this.#snapshot);
      }
    } finally {
      this.#handle.release();
    }
  }

  #activate(prepareAllFullClips: boolean, beginDesired = true): void {
    if (this.#activity !== 'active') {
      return;
    }

    const changed = !this.#autoLoad;
    this.#autoLoad = true;
    this.#stopObserving?.();
    this.#stopObserving = null;

    if (changed) {
      this.#supersedeReadiness();
    }

    if (prepareAllFullClips) {
      this.#prepareAllFullClips();
    }

    if (
      beginDesired &&
      this.#desired !== null &&
      (changed ||
        this.#activeClipId !== this.#desired.clipId ||
        this.#loadState === 'idle' ||
        this.#loadState === 'unloaded' ||
        this.#loadState === 'error')
    ) {
      this.#beginDesiredClip();
    }
  }

  #observeNearViewport(config: ControllerBindingConfig, onEnter: () => void): () => void {
    try {
      return this.#dependencies.observeNearViewport(
        this.#target,
        config.loading.rootMargin ?? '0px',
        onEnter,
      );
    } catch (cause) {
      throw cause instanceof FrameByFrameError
        ? cause
        : new FrameByFrameError(
            'ENVIRONMENT_UNAVAILABLE',
            'The target-near-viewport observer could not be created.',
            { cause, details: { bindingId: config.id } },
          );
    }
  }

  #startConfiguredLoadingPolicy(): void {
    this.#stopObserving?.();
    this.#stopObserving = null;
    if (this.#loadState === 'unloaded') {
      this.#loadState = 'idle';
    }
    this.#autoLoad = this.#config.loading.mode === 'immediate';

    if (this.#autoLoad) {
      this.#prepareAllFullClips();

      if (this.#desired !== null) {
        if (
          this.#activeClipId === this.#desired.clipId &&
          (this.#loadState === 'metadata' || this.#loadState === 'ready')
        ) {
          this.#requestSeek(this.#desired);
        } else {
          this.#beginDesiredClip();
        }
      }
      return;
    }

    if (this.#config.loading.trigger === 'target-near-viewport') {
      this.#stopObserving = this.#observeNearViewport(this.#config, (): void => {
        this.#activate(true, true);
      });
    }

    if (this.#config.loading.trigger === 'first-use' && this.#desired !== null) {
      this.#activate(false, true);
    }
  }

  #prepareAllFullClips(): void {
    for (const clip of this.#config.clips) {
      if (clip.preload === 'full') {
        const preparation = this.#ensureFullAsset(clip, 0);
        void preparation.result.catch((): void => undefined);
      }
    }
  }

  #ensureFullAsset(clip: ControllerVideoClipConfig, startIndex: number): FullAssetPreparation {
    const current = this.#fullAssets.get(clip.id);

    if (current !== undefined) {
      return current;
    }

    const candidates = this.#playableSources(clip);
    const preparation: FullAssetPreparation = {
      clipId: clip.id,
      consumer: null,
      result: Promise.resolve(null as never),
    };
    preparation.result = this.#loadFullAssetCandidates(
      preparation,
      clip,
      candidates,
      startIndex,
    ).catch((cause: unknown): never => {
      const error =
        cause instanceof FrameByFrameError
          ? cause
          : createError(
              'FULL_PRELOAD_FAILED',
              `Every full-preload source failed for video clip "${clip.id}".`,
              this.#config.id,
              clip.id,
              candidates.at(-1)?.src ?? null,
              cause,
            );

      if (this.#fullAssets.get(clip.id) === preparation && !this.#destroyed) {
        this.#error = error;
        this.#emit({ type: 'error', error });
      }

      throw error;
    });
    this.#fullAssets.set(clip.id, preparation);
    return preparation;
  }

  async #loadFullAssetCandidates(
    preparation: FullAssetPreparation,
    clip: ControllerVideoClipConfig,
    candidates: readonly ControllerVideoSourceConfig[],
    startIndex: number,
  ): Promise<PreparedFullAsset> {
    let lastCause: unknown;

    for (let sourceIndex = startIndex; sourceIndex < candidates.length; sourceIndex += 1) {
      const source = candidates[sourceIndex];

      if (source === undefined) {
        continue;
      }

      try {
        const url = this.#dependencies.resolveUrl(source.src, this.#target);
        const consumer = this.#dependencies.assetCache.acquire(
          {
            url,
            credentials: this.#config.loading.credentials,
            cache: this.#config.loading.cache,
          },
          (progress): void => {
            if (this.#fullAssets.get(clip.id) === preparation) {
              this.#publishProgress(clip.id, progress);
            }
          },
        );
        preparation.consumer = consumer;

        try {
          const asset = await consumer.result;
          return Object.freeze({ asset, source, sourceIndex });
        } catch (cause) {
          lastCause = cause;
          consumer.release();
          preparation.consumer = null;
        }
      } catch (cause) {
        lastCause = cause;
      }
    }

    throw createError(
      'FULL_PRELOAD_FAILED',
      `Every full-preload source failed for video clip "${clip.id}".`,
      this.#config.id,
      clip.id,
      candidates.at(-1)?.src ?? null,
      lastCause,
    );
  }

  #publishProgress(clipId: string, progress: AssetLoadProgress): void {
    const snapshot = Object.freeze({ ...progress });
    this.#loadProgress.set(clipId, snapshot);
    this.#emit({ type: 'loadprogress', clipId, progress: snapshot });
  }

  #releaseFullAssets(): void {
    for (const preparation of this.#fullAssets.values()) {
      preparation.consumer?.release();
    }

    this.#fullAssets.clear();
    this.#loadProgress.clear();
  }

  #discardFullAsset(clipId: string): void {
    const preparation = this.#fullAssets.get(clipId);
    preparation?.consumer?.release();
    this.#fullAssets.delete(clipId);
    this.#loadProgress.delete(clipId);
  }

  #readinessTasks(): Promise<unknown>[] {
    if (!this.#autoLoad) {
      return [];
    }

    const tasks: Promise<unknown>[] = [...this.#fullAssets.values()].map(
      (preparation) => preparation.result,
    );
    const desired = this.#desired;

    if (desired === null) {
      return tasks;
    }

    const clip = this.#config.clips.find((candidate) => candidate.id === desired.clipId);

    if (clip === undefined || clip.preload === 'none') {
      return tasks;
    }

    if (clip.preload === 'full') {
      const preparation = this.#ensureFullAsset(clip, 0);

      if (!tasks.includes(preparation.result)) {
        tasks.push(preparation.result);
      }
    }

    tasks.push(this.#waitForReadiness(clip.id, clip.preload === 'metadata' ? 'metadata' : 'ready'));
    return tasks;
  }

  #waitForReadiness(clipId: string, state: 'metadata' | 'ready'): Promise<void> {
    if (this.#activeClipId === clipId && this.#hasReadiness(state)) {
      return Promise.resolve();
    }

    if (this.#activeClipId === clipId && this.#loadState === 'error' && this.#error !== null) {
      return Promise.reject(this.#error);
    }

    return new Promise<void>((resolve, reject): void => {
      this.#readinessWaiters.add({ clipId, state, resolve, reject });
    });
  }

  #hasReadiness(state: 'metadata' | 'ready'): boolean {
    return state === 'metadata'
      ? this.#loadState === 'metadata' || this.#loadState === 'ready'
      : this.#loadState === 'ready';
  }

  #resolveReadinessWaiters(): void {
    for (const waiter of this.#readinessWaiters) {
      if (waiter.clipId === this.#activeClipId && this.#hasReadiness(waiter.state)) {
        waiter.resolve();
        this.#readinessWaiters.delete(waiter);
      }
    }
  }

  #supersedeReadiness(): void {
    this.#readinessGeneration += 1;

    for (const waiter of this.#readinessWaiters) {
      waiter.resolve();
    }

    this.#readinessWaiters.clear();
  }

  #rejectReadinessWaiters(error: FrameByFrameError): void {
    for (const waiter of this.#readinessWaiters) {
      waiter.reject(error);
    }

    this.#readinessWaiters.clear();
  }

  #playableSources(clip: ControllerVideoClipConfig): readonly ControllerVideoSourceConfig[] {
    return clip.sources.filter((source) => {
      if (source.type === null) {
        return true;
      }

      try {
        return this.#target.canPlayType(source.type) !== '';
      } catch {
        return false;
      }
    });
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

    const candidates = this.#playableSources(clip);

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

    if (clip.preload === 'full') {
      this.#startFullCandidate(clip, 0);
    } else {
      this.#startCandidate(clip, candidates[0]);
    }
  }

  #startFullCandidate(clip: ControllerVideoClipConfig, startIndex: number): void {
    const source = this.#candidateSources[startIndex];

    if (source === undefined || this.#destroyed) {
      return;
    }

    const generation = this.#prepareCandidate(clip, source);
    const preparation = this.#ensureFullAsset(clip, startIndex);
    void preparation.result.then(
      (prepared): void => {
        if (!this.#isCurrentGeneration(generation)) {
          return;
        }

        this.#candidateIndex = prepared.sourceIndex;
        this.#selectedSource = prepared.source.src;
        this.#loadTargetSource(prepared.asset.objectUrl, generation);
      },
      (error: unknown): void => {
        const packageError =
          error instanceof FrameByFrameError
            ? error
            : createError(
                'FULL_PRELOAD_FAILED',
                `Full preload failed for video clip "${clip.id}".`,
                this.#config.id,
                clip.id,
                source.src,
                error,
              );

        if (this.#isCurrentGeneration(generation)) {
          this.#fail(packageError, this.#error !== packageError);
        }
      },
    );
  }

  #startCandidate(
    clip: ControllerVideoClipConfig,
    source: ControllerVideoSourceConfig | undefined,
  ): void {
    if (source === undefined || this.#destroyed) {
      return;
    }

    const generation = this.#prepareCandidate(clip, source);
    this.#loadTargetSource(source.src, generation);
  }

  #prepareCandidate(clip: ControllerVideoClipConfig, source: ControllerVideoSourceConfig): number {
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
    this.#applyClipAttributes(clip);
    this.#emit({ type: 'loadstart', clipId: clip.id });
    return generation;
  }

  #loadTargetSource(targetSource: string, generation: number): void {
    this.#attachSourceListeners(generation);

    try {
      this.#target.pause();
      this.#target.srcObject = null;
      this.#target.setAttribute('src', targetSource);
      this.#target.load();
    } catch (cause) {
      this.#handleSourceFailure(generation, cause);
    }
  }

  #applyClipAttributes(clip: ControllerVideoClipConfig): void {
    this.#target.preload = clip.preload === 'full' ? 'auto' : clip.preload;

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
    this.#resolveReadinessWaiters();

    if (this.#activity === 'active' && this.#desired?.clipId === clipId) {
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
    this.#resolveReadinessWaiters();

    if (this.#activity !== 'active') {
      return;
    }

    if (this.#supportsVideoFrameCallback()) {
      this.#scheduleFrameObservation();
    } else if (!this.#seekInFlight) {
      this.#presentFrame(this.#target.currentTime, null, null, null);
    }
  }

  #handleSeeked(): void {
    this.#seekInFlight = false;
    this.#seeking = false;

    if (this.#activity === 'active' && !this.#supportsVideoFrameCallback()) {
      this.#presentFrame(this.#target.currentTime, null, null, null);
    }

    const pending = this.#pendingSeek;
    this.#pendingSeek = null;

    if (this.#activity === 'active' && pending !== null && pending.clipId === this.#activeClipId) {
      this.#requestSeek(pending);
    }
  }

  #requestSeek(desired: DesiredMediaTarget): void {
    if (
      this.#activity !== 'active' ||
      desired.clipId !== this.#activeClipId ||
      this.#loadState === 'loading'
    ) {
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
    if (
      this.#activity !== 'active' ||
      !this.#supportsVideoFrameCallback() ||
      this.#activeClipId === null
    ) {
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

    if (this.#activity !== 'active' || clipId === null || !Number.isFinite(presentedTime)) {
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

      if (clip.preload === 'full') {
        this.#discardFullAsset(clip.id);
        this.#startFullCandidate(clip, nextIndex);
      } else {
        this.#startCandidate(clip, this.#candidateSources[nextIndex]);
      }
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

  #fail(error: FrameByFrameError, emit = true): void {
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
    this.#rejectReadinessWaiters(error);

    if (emit) {
      this.#emit({ type: 'error', error });
    }
  }

  #resetSource(loadState: 'idle' | 'unloaded'): void {
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
  dependencies: VideoRendererDependencies = defaultDependencies,
  activity: VideoRendererActivity = 'active',
): VideoRenderer => new NativeVideoRenderer(config, handle, onEvent, dependencies, activity);
