import { FrameByFrameError } from '../core/errors.js';
import { calculateCanvasDrawPlan } from './canvas-layout.js';
import { createNativeVideoRenderer } from './video-renderer.js';

import type {
  ControllerBindingConfig,
  ControllerCanvasOptions,
} from '../core/controller-config.js';
import type { ResolvedCanvasTarget } from './canvas-target.js';
import type { ResolvedVideoTarget } from './video-target.js';
import type {
  MediaRenderer,
  VideoRenderer,
  VideoRendererActivity,
  VideoRendererConfigTransaction,
  VideoRendererDependencies,
  VideoRendererEvent,
  VideoRendererState,
} from './video-renderer.js';
import type { FrameByFrameErrorCode, TimelineResolution } from '../types.js';

interface DrawWaiter {
  readonly resolve: () => void;
  readonly reject: (error: FrameByFrameError) => void;
}

const initialState = (): VideoRendererState => ({
  loadState: 'idle',
  loadProgress: Object.freeze({}),
  activeClipId: null,
  selectedSource: null,
  duration: null,
  appliedTime: null,
  presentedTime: null,
  seeking: false,
  error: null,
});

const decoderConfig = (config: ControllerBindingConfig): ControllerBindingConfig =>
  Object.freeze({
    ...config,
    clips: Object.freeze(
      config.clips.map((clip) =>
        clip.preload === 'metadata' ? Object.freeze({ ...clip, preload: 'auto' as const }) : clip,
      ),
    ),
  });

const canvasError = (
  code: FrameByFrameErrorCode,
  message: string,
  bindingId: string,
  cause?: unknown,
): FrameByFrameError =>
  new FrameByFrameError(code, message, {
    cause,
    details: { bindingId },
  });

const isSecurityError = (cause: unknown): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  'name' in cause &&
  (cause as { readonly name?: unknown }).name === 'SecurityError';

const resolveDevicePixelRatio = (target: HTMLCanvasElement): number => {
  const ownerRatio: unknown = target.ownerDocument.defaultView?.devicePixelRatio;
  const globalRatio: unknown = (globalThis as { readonly devicePixelRatio?: unknown })
    .devicePixelRatio;
  const ratio = typeof ownerRatio === 'number' ? ownerRatio : globalRatio;
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};

class CanvasRenderer implements MediaRenderer {
  #config: ControllerBindingConfig;
  readonly #canvasHandle: ResolvedCanvasTarget;
  readonly #decoderHandle: ResolvedVideoTarget;
  readonly #canvas: HTMLCanvasElement;
  readonly #decoder: HTMLVideoElement;
  readonly #context: CanvasRenderingContext2D | null;
  readonly #onEvent: (event: VideoRendererEvent) => void;
  readonly #drawWaiters = new Set<DrawWaiter>();
  readonly #video: VideoRenderer | null;
  readonly #removeDecoderListeners: () => void;

  #fallbackState = initialState();
  #canvasFailure: FrameByFrameError | null = null;
  #presentedTime: number | null = null;
  #lastDrawSignature: string | null = null;
  #drawGeneration = 0;
  #activity: VideoRendererActivity;
  #destroyed = false;

  constructor(
    config: ControllerBindingConfig,
    canvasHandle: ResolvedCanvasTarget,
    decoderHandle: ResolvedVideoTarget,
    onEvent: (event: VideoRendererEvent) => void,
    activity: VideoRendererActivity,
    dependencies: VideoRendererDependencies | undefined,
  ) {
    this.#config = config;
    this.#canvasHandle = canvasHandle;
    this.#decoderHandle = decoderHandle;
    this.#canvas = canvasHandle.target;
    this.#decoder = decoderHandle.target;
    this.#onEvent = onEvent;
    this.#activity = activity;

    let context: CanvasRenderingContext2D | null = null;

    try {
      context = this.#canvas.getContext('2d');
    } catch (cause) {
      this.#canvasFailure = canvasError(
        'CANVAS_CONTEXT_UNAVAILABLE',
        'The canvas target could not create a 2D rendering context.',
        config.id,
        cause,
      );
    }

    if (context === null && this.#canvasFailure === null) {
      this.#canvasFailure = canvasError(
        'CANVAS_CONTEXT_UNAVAILABLE',
        'The canvas target does not provide a 2D rendering context.',
        config.id,
      );
    }

    this.#context = context;

    if (context === null) {
      this.#video = null;
      this.#decoderHandle.release();
      this.#fallbackState = {
        ...this.#fallbackState,
        loadState: 'error',
        error: this.#canvasFailure,
      };
      this.#removeDecoderListeners = (): void => undefined;
      globalThis.queueMicrotask((): void => {
        if (!this.#destroyed && this.#canvasFailure !== null) {
          this.#onEvent({ type: 'error', error: this.#canvasFailure });
        }
      });
      return;
    }

    this.#video = createNativeVideoRenderer(
      decoderConfig(config),
      decoderHandle,
      (event): void => {
        this.#handleVideoEvent(event);
      },
      dependencies,
      activity,
      this.#canvas,
    );

    const scheduleFallbackDraw = (): void => {
      const generation = this.#drawGeneration;
      const presentedTime = this.#decoder.currentTime;
      globalThis.queueMicrotask((): void => {
        if (generation === this.#drawGeneration && !this.#destroyed) {
          this.#drawDecoderFrame(null, null, null, false, presentedTime);
        }
      });
    };
    this.#decoder.addEventListener('loadeddata', scheduleFallbackDraw);
    this.#decoder.addEventListener('seeked', scheduleFallbackDraw);
    this.#removeDecoderListeners = (): void => {
      this.#decoder.removeEventListener('loadeddata', scheduleFallbackDraw);
      this.#decoder.removeEventListener('seeked', scheduleFallbackDraw);
    };

    this.resize();
  }

  prepareConfig(config: ControllerBindingConfig): VideoRendererConfigTransaction {
    this.#assertNotDestroyed();
    const currentCanvas = this.#config.canvas;
    const nextCanvas = config.canvas;

    if (
      config.id !== this.#config.id ||
      config.axis !== this.#config.axis ||
      config.renderer !== 'canvas' ||
      config.target !== this.#config.target ||
      config.mountTo !== this.#config.mountTo ||
      currentCanvas === null ||
      nextCanvas === null ||
      config.canvas?.decoderTarget !== currentCanvas.decoderTarget
    ) {
      throw new FrameByFrameError(
        'INVALID_BREAKPOINT_CONFIG',
        'Responsive overrides cannot change canvas identity, renderer, target, or decoder ownership.',
        { details: { bindingId: this.#config.id } },
      );
    }

    const videoTransaction =
      this.#config.decoderSignature === config.decoderSignature
        ? undefined
        : this.#video?.prepareConfig(decoderConfig(config));
    let settled = false;

    return {
      commit: (): void => {
        if (settled) {
          return;
        }

        settled = true;
        videoTransaction?.commit();
        this.#config = config;
        if (this.#context !== null) {
          this.#canvasFailure = null;
        }
        this.#lastDrawSignature = null;
        const generation = ++this.#drawGeneration;
        this.#resolveDrawWaiters();
        globalThis.queueMicrotask((): void => {
          if (!this.#destroyed && generation === this.#drawGeneration) {
            this.resize();
          }
        });
      },
      cancel: (): void => {
        if (settled) {
          return;
        }

        settled = true;
        videoTransaction?.cancel();
      },
    };
  }

  setActivity(activity: VideoRendererActivity): void {
    this.#assertNotDestroyed();
    this.#activity = activity;
    this.#video?.setActivity(activity);

    if (activity === 'active') {
      this.resize();
    }
  }

  setResolution(resolution: TimelineResolution | null): void {
    this.#assertNotDestroyed();
    this.#video?.setResolution(resolution);
  }

  load(): Promise<void> {
    this.#assertNotDestroyed();

    if (this.#video === null) {
      const error = this.#canvasFailure;

      if (error === null) {
        return Promise.reject(
          canvasError(
            'CANVAS_CONTEXT_UNAVAILABLE',
            'The canvas renderer is unavailable.',
            this.#config.id,
          ),
        );
      }

      return Promise.reject(error);
    }

    return this.#video.load();
  }

  async whenReady(): Promise<void> {
    this.#assertNotDestroyed();

    if (this.#video === null) {
      const error = this.#canvasFailure;

      if (error === null) {
        throw canvasError(
          'CANVAS_CONTEXT_UNAVAILABLE',
          'The canvas renderer is unavailable.',
          this.#config.id,
        );
      }

      throw error;
    }

    for (;;) {
      const generation = this.#drawGeneration;
      await this.#video.whenReady();

      if (generation !== this.#drawGeneration) {
        continue;
      }

      if (this.#canvasFailure !== null) {
        throw this.#canvasFailure;
      }

      const state = this.#video.getState();
      const clip = this.#config.clips.find((candidate) => candidate.id === state.activeClipId);

      if (
        clip === undefined ||
        clip.preload === 'none' ||
        state.loadState === 'idle' ||
        state.loadState === 'unloaded'
      ) {
        return;
      }

      if (this.#presentedTime !== null && this.#lastDrawSignature !== null) {
        return;
      }

      await new Promise<void>((resolve, reject): void => {
        this.#drawWaiters.add({ resolve, reject });
      });

      if (generation === this.#drawGeneration && this.#lastDrawSignature !== null) {
        return;
      }
    }
  }

  unload(): void {
    this.#assertNotDestroyed();
    ++this.#drawGeneration;
    this.#lastDrawSignature = null;
    this.#presentedTime = null;
    this.#resolveDrawWaiters();

    if (this.#video === null) {
      this.#fallbackState = { ...this.#fallbackState, loadState: 'unloaded', error: null };
      return;
    }

    this.#video.unload();
  }

  resize(): void {
    this.#assertNotDestroyed();
    const options = this.#canvasOptions();
    const ratio =
      options.pixelRatio === 'device' ? resolveDevicePixelRatio(this.#canvas) : options.pixelRatio;
    const cssWidth = this.#canvas.clientWidth;
    const cssHeight = this.#canvas.clientHeight;

    if (
      !Number.isFinite(cssWidth) ||
      !Number.isFinite(cssHeight) ||
      cssWidth <= 0 ||
      cssHeight <= 0
    ) {
      return;
    }

    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));

    if (this.#canvas.width !== width) {
      this.#canvas.width = width;
    }

    if (this.#canvas.height !== height) {
      this.#canvas.height = height;
    }

    this.#lastDrawSignature = null;
    this.#drawDecoderFrame(
      null,
      null,
      null,
      true,
      this.#presentedTime ?? this.#decoder.currentTime,
    );
  }

  getTarget(): HTMLCanvasElement {
    this.#assertNotDestroyed();
    return this.#canvas;
  }

  getState(): VideoRendererState {
    const state = this.#video?.getState() ?? this.#fallbackState;

    return {
      ...state,
      ...(this.#canvasFailure === null
        ? { presentedTime: this.#presentedTime }
        : {
            loadState: 'error' as const,
            presentedTime: this.#presentedTime,
            error: this.#canvasFailure,
          }),
    };
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    ++this.#drawGeneration;
    this.#lastDrawSignature = null;
    this.#presentedTime = null;
    this.#canvasFailure = null;
    this.#fallbackState = {
      ...this.#fallbackState,
      loadState: 'unloaded',
      presentedTime: null,
      error: null,
    };
    this.#removeDecoderListeners();
    this.#rejectDrawWaiters(
      new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller was destroyed while a canvas frame was pending.',
        { details: { bindingId: this.#config.id } },
      ),
    );

    try {
      if (this.#video === null) {
        this.#decoderHandle.release();
      } else {
        this.#video.destroy();
      }
    } finally {
      this.#canvasHandle.release();
    }
  }

  #handleVideoEvent(event: VideoRendererEvent): void {
    if (event.type === 'frame') {
      this.#drawDecoderFrame(
        event.expectedDisplayTime,
        event.width,
        event.height,
        false,
        event.presentedTime,
      );
      return;
    }

    if (event.type === 'loadstart') {
      ++this.#drawGeneration;
      this.#lastDrawSignature = null;
      this.#presentedTime = null;
      this.#canvasFailure = null;
      this.#resolveDrawWaiters();
    }

    this.#onEvent(event);
  }

  #drawDecoderFrame(
    expectedDisplayTime: number | null,
    observedWidth: number | null,
    observedHeight: number | null,
    force: boolean,
    observedTime: number = this.#decoder.currentTime,
  ): void {
    if (
      this.#destroyed ||
      this.#activity !== 'active' ||
      this.#context === null ||
      !Number.isFinite(observedTime)
    ) {
      return;
    }

    const state = this.#video?.getState();
    const clipId = state?.activeClipId;

    if (clipId === null || clipId === undefined) {
      return;
    }

    const sourceWidth =
      this.#decoder.videoWidth > 0 ? this.#decoder.videoWidth : (observedWidth ?? 0);
    const sourceHeight =
      this.#decoder.videoHeight > 0 ? this.#decoder.videoHeight : (observedHeight ?? 0);
    const options = this.#canvasOptions();
    const ratio =
      options.pixelRatio === 'device' ? resolveDevicePixelRatio(this.#canvas) : options.pixelRatio;
    const plan = calculateCanvasDrawPlan(
      sourceWidth,
      sourceHeight,
      this.#canvas.width,
      this.#canvas.height,
      options.fit,
      ratio,
    );

    if (plan === null) {
      return;
    }

    const signature = JSON.stringify({
      clipId,
      observedTime,
      sourceWidth,
      sourceHeight,
      width: this.#canvas.width,
      height: this.#canvas.height,
      fit: options.fit,
      smoothing: options.imageSmoothingEnabled,
    });

    if (!force && signature === this.#lastDrawSignature) {
      return;
    }

    try {
      this.#context.imageSmoothingEnabled = options.imageSmoothingEnabled;
      this.#context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
      this.#context.drawImage(
        this.#decoder,
        plan.sourceX,
        plan.sourceY,
        plan.sourceWidth,
        plan.sourceHeight,
        plan.destinationX,
        plan.destinationY,
        plan.destinationWidth,
        plan.destinationHeight,
      );
    } catch (cause) {
      this.#failDraw(
        canvasError(
          isSecurityError(cause) ? 'CANVAS_SECURITY_ERROR' : 'CANVAS_DRAW_FAILED',
          isSecurityError(cause)
            ? 'The decoded video frame could not be drawn because of canvas security restrictions.'
            : 'The decoded video frame could not be drawn to the canvas.',
          this.#config.id,
          cause,
        ),
      );
      return;
    }

    this.#canvasFailure = null;
    this.#lastDrawSignature = signature;
    this.#presentedTime = observedTime;
    this.#resolveDrawWaiters();
    this.#onEvent({
      type: 'frame',
      clipId,
      presentedTime: observedTime,
      expectedDisplayTime,
      width: sourceWidth,
      height: sourceHeight,
    });
  }

  #failDraw(error: FrameByFrameError): void {
    const shouldEmit = this.#canvasFailure?.code !== error.code;
    this.#canvasFailure = error;
    this.#rejectDrawWaiters(error);

    if (shouldEmit) {
      this.#onEvent({ type: 'error', error });
    }
  }

  #canvasOptions(): ControllerCanvasOptions {
    const options = this.#config.canvas;

    if (options === null) {
      throw new FrameByFrameError('INVALID_MEDIA_CONFIG', 'Canvas renderer options are missing.', {
        details: { bindingId: this.#config.id },
      });
    }

    return options;
  }

  #resolveDrawWaiters(): void {
    for (const waiter of this.#drawWaiters) {
      waiter.resolve();
    }

    this.#drawWaiters.clear();
  }

  #rejectDrawWaiters(error: FrameByFrameError): void {
    for (const waiter of this.#drawWaiters) {
      waiter.reject(error);
    }

    this.#drawWaiters.clear();
  }

  #assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The canvas renderer has already been destroyed.',
        { details: { bindingId: this.#config.id } },
      );
    }
  }
}

/** Creates a canvas renderer around already resolved and claimed presentation targets. */
export const createCanvasRenderer = (
  config: ControllerBindingConfig,
  canvasHandle: ResolvedCanvasTarget,
  decoderHandle: ResolvedVideoTarget,
  onEvent: (event: VideoRendererEvent) => void,
  activity: VideoRendererActivity = 'active',
  dependencies?: VideoRendererDependencies,
): MediaRenderer =>
  new CanvasRenderer(config, canvasHandle, decoderHandle, onEvent, activity, dependencies);
