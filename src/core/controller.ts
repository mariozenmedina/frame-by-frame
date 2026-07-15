import { EventEmitter } from './event-emitter.js';
import { FrameByFrameError } from './errors.js';
import { compileControllerProgram, resolveControllerConfig } from './controller-config.js';
import { createControllerEnvironmentObserver } from '../responsive/environment-observer.js';

import type {
  ControllerBindingConfig,
  ControllerConfig,
  ControllerProgram,
} from './controller-config.js';
import type {
  VideoRenderer,
  VideoRendererConfigTransaction,
  VideoRendererEvent,
  VideoRendererFactory,
  VideoRendererState,
} from '../media/video-renderer.js';
import type {
  ControllerEnvironmentObserver,
  ControllerEnvironmentObserverFactory,
  ControllerEnvironmentSnapshot,
} from '../responsive/environment-observer.js';
import type { ResolvedScrollSource } from '../scroll/source.js';
import type {
  AsyncErrorReporter,
  ScrollSourceSnapshot,
  SourceRegistry,
  SourceScheduler,
} from '../scroll/source-scheduler.js';
import type {
  AxisName,
  FrameByFrameAxisState,
  FrameByFrameBindingState,
  FrameByFrameController,
  FrameByFrameErrorCode,
  FrameByFrameEventMap,
  FrameByFrameOptions,
  FrameByFrameState,
  FrameByFrameStatus,
  FrameByFrameUpdateReason,
  ScrollSource,
  TimelineResolution,
} from '../types.js';

export interface ControllerDependencies {
  readonly resolveSource: (reference: unknown) => ResolvedScrollSource;
  readonly sourceRegistry: SourceRegistry;
  readonly reportAsyncError: AsyncErrorReporter;
  readonly createVideoRenderer: VideoRendererFactory;
  readonly createEnvironmentObserver?: ControllerEnvironmentObserverFactory;
}

interface MutableAxisState {
  enabled: boolean;
  offset: number;
  max: number;
  progress: number;
}

interface MutableBindingState {
  config: ControllerBindingConfig;
  resolution: TimelineResolution | null;
  renderer: VideoRenderer | null;
  media: VideoRendererState;
}

const createInitialMediaState = (): VideoRendererState => ({
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

const cloneResolution = (resolution: TimelineResolution): TimelineResolution =>
  Object.freeze({ ...resolution });

const cloneError = (error: FrameByFrameError): FrameByFrameError =>
  new FrameByFrameError(error.code, error.message, {
    cause: error.cause,
    ...(error.details === undefined ? {} : { details: error.details }),
  });

const asPackageError = (
  error: unknown,
  code: FrameByFrameErrorCode,
  message: string,
): FrameByFrameError =>
  error instanceof FrameByFrameError
    ? error
    : new FrameByFrameError(code, message, { cause: error });

class Controller implements FrameByFrameController {
  readonly #program: ControllerProgram;
  #config: ControllerConfig;
  readonly #dependencies: ControllerDependencies;
  readonly #events: EventEmitter<FrameByFrameEventMap>;
  readonly #axes: Partial<Record<AxisName, MutableAxisState>> = {};
  readonly #bindings = new Map<string, MutableBindingState>();
  readonly #handleScroll = (snapshot: ScrollSourceSnapshot): void => {
    if (this.#status !== 'ready' || !this.#enabled || this.#hidden) {
      return;
    }

    try {
      this.#applySnapshot(snapshot, true);
      this.#emitUpdate('scroll');
    } catch (error) {
      this.#transitionToRuntimeError(error);
    }
  };

  #status: FrameByFrameStatus = 'idle';
  #enabled = true;
  #source: ScrollSource | null = null;
  #scheduler: SourceScheduler | null = null;
  #unsubscribe: (() => void) | null = null;
  #mountPromise: Promise<void> | null = null;
  #mountGeneration = 0;
  #lastError: FrameByFrameError | null = null;
  #environment: ControllerEnvironmentObserver | null = null;
  #activeBreakpoints: readonly string[] = Object.freeze([]);
  #prefersReducedMotion = false;
  #hidden = false;

  constructor(options: FrameByFrameOptions, dependencies: ControllerDependencies) {
    this.#program = compileControllerProgram(options);
    this.#config = this.#program.base;
    this.#dependencies = dependencies;
    this.#events = new EventEmitter(dependencies.reportAsyncError);

    for (const [axisName, axisConfig] of Object.entries(this.#config.axes) as [
      AxisName,
      NonNullable<ControllerConfig['axes'][AxisName]>,
    ][]) {
      this.#axes[axisName] = {
        enabled: axisConfig.enabled,
        offset: 0,
        max: 0,
        progress: 0,
      };
    }

    for (const binding of this.#config.bindings) {
      this.#bindings.set(binding.id, {
        config: binding,
        resolution: null,
        renderer: null,
        media: createInitialMediaState(),
      });
    }
  }

  mount(): Promise<void> {
    this.#assertNotDestroyed();

    if (this.#status === 'ready' || this.#status === 'disabled') {
      return Promise.resolve();
    }

    if (this.#status === 'mounting' && this.#mountPromise !== null) {
      return this.#mountPromise;
    }

    const generation = ++this.#mountGeneration;
    this.#status = 'mounting';
    this.#lastError = null;

    const promise = Promise.resolve()
      .then((): void => {
        this.#performMount(generation);
      })
      .catch((error: unknown): never => {
        throw this.#handleMountFailure(error, generation);
      })
      .finally((): void => {
        if (this.#mountPromise === promise) {
          this.#mountPromise = null;
        }
      });

    this.#mountPromise = promise;
    return promise;
  }

  refresh(): void {
    this.#assertNotDestroyed();

    if ((this.#status !== 'ready' && this.#status !== 'disabled') || this.#scheduler === null) {
      throw new FrameByFrameError(
        'INVALID_LIFECYCLE_OPERATION',
        'refresh() requires a successfully mounted controller.',
        { details: { status: this.#status } },
      );
    }

    try {
      this.#applySnapshot(this.#scheduler.refresh(), this.#enabled);
      this.#emitUpdate('refresh');
    } catch (error) {
      const packageError = this.#transitionToRuntimeError(error);
      throw packageError;
    }
  }

  enable(): void {
    this.#assertNotDestroyed();

    if (this.#enabled) {
      return;
    }

    this.#enabled = true;

    if (this.#status === 'disabled' && this.#scheduler !== null) {
      try {
        this.#applySnapshot(this.#scheduler.getSnapshot(), true);
        this.#status = 'ready';
        this.#subscribe();
      } catch (error) {
        const packageError = this.#transitionToRuntimeError(error);
        throw packageError;
      }
    }

    this.#emitUpdate('enable');
  }

  disable(): void {
    this.#assertNotDestroyed();

    if (!this.#enabled) {
      return;
    }

    this.#enabled = false;

    if (this.#status === 'ready') {
      this.#unsubscribeFromSource();
      this.#status = 'disabled';
    }

    this.#emitUpdate('disable');
  }

  load(bindingId?: string): Promise<void> {
    this.#assertMediaLifecycle('load()');
    return Promise.all(
      this.#selectBindings(bindingId).map((binding) => this.#getMountedRenderer(binding).load()),
    ).then((): void => undefined);
  }

  whenReady(): Promise<FrameByFrameState> {
    this.#assertMediaLifecycle('whenReady()');
    return Promise.all(
      [...this.#bindings.values()].map((binding) => this.#getMountedRenderer(binding).whenReady()),
    ).then((): FrameByFrameState => {
      this.#assertNotDestroyed();
      return this.getState();
    });
  }

  unload(bindingId?: string): void {
    this.#assertMediaLifecycle('unload()');

    for (const binding of this.#selectBindings(bindingId)) {
      this.#getMountedRenderer(binding).unload();
    }
  }

  getTarget(bindingId: string): HTMLVideoElement | null {
    this.#assertNotDestroyed();
    const binding = this.#getBinding(bindingId);
    return binding.renderer?.getTarget() ?? null;
  }

  getState(): FrameByFrameState {
    const axes: Partial<Record<AxisName, FrameByFrameAxisState>> = {};

    for (const [axisName, axis] of Object.entries(this.#axes) as [AxisName, MutableAxisState][]) {
      axes[axisName] = Object.freeze({
        enabled: axis.enabled,
        offset: axis.offset,
        max: axis.max,
        progress: axis.progress,
      });
    }

    const bindings: Record<string, FrameByFrameBindingState> = {};

    for (const [id, binding] of this.#bindings) {
      const media = binding.renderer?.getState() ?? binding.media;
      bindings[id] = Object.freeze({
        id,
        axis: binding.config.axis,
        resolution: binding.resolution === null ? null : cloneResolution(binding.resolution),
        renderer: 'video',
        loadState: media.loadState,
        loadProgress: Object.freeze(
          Object.fromEntries(
            Object.entries(media.loadProgress).map(([clipId, progress]) => [
              clipId,
              Object.freeze({ ...progress }),
            ]),
          ),
        ),
        activeClipId: media.activeClipId,
        selectedSource: media.selectedSource,
        duration: media.duration,
        appliedTime: media.appliedTime,
        presentedTime: media.presentedTime,
        seeking: media.seeking,
        error: media.error === null ? null : cloneError(media.error),
      });
    }

    return Object.freeze({
      status: this.#status,
      enabled: this.#enabled,
      source: this.#source,
      activeBreakpoints: Object.freeze([...this.#activeBreakpoints]),
      prefersReducedMotion: this.#prefersReducedMotion,
      axes: Object.freeze(axes),
      bindings: Object.freeze(bindings),
      lastError: this.#lastError === null ? null : cloneError(this.#lastError),
    });
  }

  on<EventName extends keyof FrameByFrameEventMap>(
    event: EventName,
    listener: (payload: FrameByFrameEventMap[EventName]) => void,
  ): () => void {
    this.#assertNotDestroyed();

    if (typeof listener !== 'function') {
      throw new FrameByFrameError('INVALID_CONTROLLER', 'Event listeners must be functions.', {
        details: { event, listener },
      });
    }

    return this.#events.on(event, listener);
  }

  destroy(): void {
    if (this.#status === 'destroyed') {
      return;
    }

    ++this.#mountGeneration;
    this.#unsubscribeFromSource();
    this.#destroyEnvironment();
    this.#destroyRenderers();
    this.#scheduler = null;
    this.#source = null;
    this.#enabled = false;
    this.#status = 'destroyed';
    this.#events.emit('destroy', this.getState());
    this.#events.clear();
  }

  #performMount(generation: number): void {
    if (generation !== this.#mountGeneration) {
      throw new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller was destroyed before mount completed.',
      );
    }

    const resolvedSource = this.#dependencies.resolveSource(this.#config.source);
    const scheduler = this.#dependencies.sourceRegistry.get(resolvedSource);
    const snapshot = scheduler.refresh();
    const createEnvironment =
      this.#dependencies.createEnvironmentObserver ?? createControllerEnvironmentObserver;
    const environment = createEnvironment({
      source: resolvedSource.publicSource,
      breakpoints: this.#program.breakpoints,
      requestFrame: resolvedSource.requestFrame,
      cancelFrame: resolvedSource.cancelFrame,
      onMediaChange: (next): void => {
        this.#handleMediaChange(next);
      },
      onResize: (): void => {
        this.#handleResize();
      },
      onVisibilityChange: (hidden): void => {
        this.#handleVisibilityChange(hidden);
      },
    });
    const environmentSnapshot = environment.getSnapshot();
    let initialConfig: ControllerConfig;

    try {
      initialConfig = resolveControllerConfig(this.#program, environmentSnapshot.activeBreakpoints);
    } catch (error) {
      environment.destroy();
      throw error;
    }

    this.#environment = environment;
    this.#activeBreakpoints = environmentSnapshot.activeBreakpoints;
    this.#prefersReducedMotion = environmentSnapshot.prefersReducedMotion;
    this.#hidden = environmentSnapshot.hidden;
    this.#adoptConfig(initialConfig);

    this.#createRenderers();

    if (generation !== this.#mountGeneration || this.#status === 'destroyed') {
      throw new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller was destroyed before mount completed.',
      );
    }

    this.#source = resolvedSource.publicSource;
    this.#scheduler = scheduler;
    this.#applyRendererActivity();
    this.#applySnapshot(snapshot, this.#enabled);
    this.#status = this.#enabled ? 'ready' : 'disabled';
    this.#subscribe();
    environment.observeTargets(
      [...this.#bindings.values()]
        .map((binding) => binding.renderer?.getTarget() ?? null)
        .filter((target): target is HTMLVideoElement => target !== null),
    );

    const state = this.getState();
    this.#events.emit('mount', state);
    this.#events.emit('update', { reason: 'mount', state: this.getState() });
  }

  #handleMountFailure(error: unknown, generation: number): FrameByFrameError {
    const packageError = asPackageError(
      error,
      'SOURCE_NOT_FOUND',
      'The controller could not mount its scroll source.',
    );

    if (this.#status === 'destroyed' || generation !== this.#mountGeneration) {
      return packageError.code === 'CONTROLLER_DESTROYED'
        ? packageError
        : new FrameByFrameError(
            'CONTROLLER_DESTROYED',
            'The controller was destroyed before mount completed.',
            { cause: packageError },
          );
    }

    this.#unsubscribeFromSource();
    this.#destroyEnvironment();
    this.#destroyRenderers();
    this.#scheduler = null;
    this.#source = null;
    this.#status = 'error';
    this.#lastError = packageError;
    this.#events.emit('error', cloneError(packageError));
    return packageError;
  }

  #applySnapshot(snapshot: ScrollSourceSnapshot, resolveBindings: boolean): void {
    for (const axisName of ['x', 'y'] as const) {
      const axis = this.#axes[axisName];

      if (axis === undefined) {
        continue;
      }

      const metrics = snapshot[axisName];
      axis.offset = metrics.offset;
      axis.max = metrics.max;
      axis.progress = metrics.progress;
    }

    for (const binding of this.#bindings.values()) {
      const axis = this.#axes[binding.config.axis];
      const reducedMotionBehavior = this.#program.reducedMotion;

      if (
        !resolveBindings ||
        !axis?.enabled ||
        (this.#prefersReducedMotion && reducedMotionBehavior === 'disable')
      ) {
        binding.resolution = null;
        binding.renderer?.setResolution(null);
        continue;
      }

      const position =
        this.#prefersReducedMotion && reducedMotionBehavior === 'first-frame'
          ? binding.config.startPosition
          : this.#prefersReducedMotion && reducedMotionBehavior === 'last-frame'
            ? binding.config.endPosition
            : binding.config.timeline.unit === 'px'
              ? axis.offset
              : axis.progress;
      binding.resolution = binding.config.timeline.resolve(position);
      binding.renderer?.setResolution(binding.resolution);
    }
  }

  #createRenderers(): void {
    try {
      for (const binding of this.#bindings.values()) {
        const renderer = this.#dependencies.createVideoRenderer(
          binding.config,
          (event): void => {
            this.#handleRendererEvent(binding.config.id, event);
          },
          this.#getRendererActivity(),
        );
        binding.renderer = renderer;
        binding.media = renderer.getState();
      }
    } catch (error) {
      this.#destroyRenderers();
      throw error;
    }
  }

  #destroyRenderers(): void {
    for (const binding of this.#bindings.values()) {
      const renderer = binding.renderer;

      if (renderer === null) {
        continue;
      }

      renderer.destroy();
      binding.media = renderer.getState();
      binding.renderer = null;
    }
  }

  #handleRendererEvent(bindingId: string, event: VideoRendererEvent): void {
    const binding = this.#bindings.get(bindingId);
    const renderer = binding?.renderer;

    if (
      binding === undefined ||
      renderer === undefined ||
      renderer === null ||
      this.#status === 'destroyed'
    ) {
      return;
    }

    binding.media = renderer.getState();

    switch (event.type) {
      case 'loadstart':
      case 'loadready':
        this.#events.emit(event.type, {
          bindingId,
          clipId: event.clipId,
          state: this.getState(),
        });
        break;
      case 'loadprogress':
        this.#events.emit('loadprogress', {
          bindingId,
          clipId: event.clipId,
          loadedBytes: event.progress.loadedBytes,
          totalBytes: event.progress.totalBytes,
          ratio: event.progress.ratio,
          state: this.getState(),
        });
        break;
      case 'loadedmetadata':
        this.#events.emit('loadedmetadata', {
          bindingId,
          clipId: event.clipId,
          duration: event.duration,
          state: this.getState(),
        });
        break;
      case 'seekrequest':
        this.#events.emit('seekrequest', {
          bindingId,
          clipId: event.clipId,
          requestedTime: event.requestedTime,
          targetTime: event.targetTime,
          state: this.getState(),
        });
        break;
      case 'frame':
        this.#events.emit('frame', {
          bindingId,
          clipId: event.clipId,
          presentedTime: event.presentedTime,
          expectedDisplayTime: event.expectedDisplayTime,
          width: event.width,
          height: event.height,
          state: this.getState(),
        });
        break;
      case 'error':
        this.#events.emit('error', cloneError(event.error));
        break;
    }
  }

  #adoptConfig(config: ControllerConfig): void {
    this.#config = config;

    for (const axisName of ['x', 'y'] as const) {
      const axis = this.#axes[axisName];
      const next = config.axes[axisName];

      if (axis !== undefined && next !== undefined) {
        axis.enabled = next.enabled;
      }
    }

    for (const next of config.bindings) {
      const binding = this.#bindings.get(next.id);

      if (binding !== undefined) {
        binding.config = next;
      }
    }
  }

  #applyResponsiveConfig(config: ControllerConfig): void {
    const transactions: VideoRendererConfigTransaction[] = [];

    try {
      for (const next of config.bindings) {
        const binding = this.#bindings.get(next.id);

        if (
          binding?.renderer !== null &&
          binding?.renderer !== undefined &&
          binding.config.mediaSignature !== next.mediaSignature
        ) {
          transactions.push(binding.renderer.prepareConfig(next));
        }
      }
    } catch (cause) {
      for (const transaction of transactions) {
        transaction.cancel();
      }

      throw asPackageError(
        cause,
        'INVALID_BREAKPOINT_CONFIG',
        'The responsive media configuration could not be prepared atomically.',
      );
    }

    for (const transaction of transactions) {
      transaction.commit();
    }

    this.#adoptConfig(config);
  }

  #handleMediaChange(snapshot: ControllerEnvironmentSnapshot): void {
    if (this.#status !== 'ready' && this.#status !== 'disabled') {
      return;
    }

    let breakpointChanged =
      snapshot.activeBreakpoints.length !== this.#activeBreakpoints.length ||
      snapshot.activeBreakpoints.some((id, index) => id !== this.#activeBreakpoints[index]);
    const preferenceChanged = snapshot.prefersReducedMotion !== this.#prefersReducedMotion;
    const previousBreakpoints = this.#activeBreakpoints;

    if (breakpointChanged) {
      try {
        const candidate = resolveControllerConfig(this.#program, snapshot.activeBreakpoints);
        this.#applyResponsiveConfig(candidate);
        this.#activeBreakpoints = Object.freeze([...snapshot.activeBreakpoints]);
        this.#lastError = null;
      } catch (error) {
        const packageError = asPackageError(
          error,
          'INVALID_BREAKPOINT_CONFIG',
          'The responsive configuration change was rejected.',
        );
        this.#lastError = packageError;
        this.#events.emit('error', cloneError(packageError));
        breakpointChanged = false;
      }
    }

    if (preferenceChanged) {
      this.#prefersReducedMotion = snapshot.prefersReducedMotion;
    }

    if (!breakpointChanged && !preferenceChanged) {
      return;
    }

    try {
      this.#applyRendererActivity();

      if (this.#scheduler !== null) {
        const scrollSnapshot = breakpointChanged
          ? this.#scheduler.refresh()
          : this.#scheduler.getSnapshot();
        this.#applySnapshot(scrollSnapshot, this.#enabled);
      }

      this.#syncSubscription();
    } catch (error) {
      this.#transitionToRuntimeError(error);
      return;
    }

    if (breakpointChanged) {
      const state = this.getState();
      this.#events.emit('breakpointchange', {
        previous: Object.freeze([...previousBreakpoints]),
        current: Object.freeze([...this.#activeBreakpoints]),
        state,
      });
      this.#emitUpdate('breakpoint');
    }

    if (preferenceChanged) {
      this.#emitUpdate('preference');
    }
  }

  #handleResize(): void {
    if (
      (this.#status !== 'ready' && this.#status !== 'disabled') ||
      this.#scheduler === null ||
      this.#hidden
    ) {
      return;
    }

    try {
      this.#applySnapshot(this.#scheduler.refresh(), this.#enabled);
      this.#emitUpdate('resize');
    } catch (error) {
      this.#transitionToRuntimeError(error);
    }
  }

  #handleVisibilityChange(hidden: boolean): void {
    if (this.#status !== 'ready' && this.#status !== 'disabled') {
      return;
    }

    this.#hidden = hidden;

    try {
      if (hidden) {
        this.#unsubscribeFromSource();
      }

      this.#applyRendererActivity();

      if (!hidden && this.#scheduler !== null) {
        this.#applySnapshot(this.#scheduler.refresh(), this.#enabled);
        this.#subscribe();
      }

      this.#emitUpdate('visibility');
    } catch (error) {
      this.#transitionToRuntimeError(error);
    }
  }

  #getRendererActivity(): 'active' | 'suspended' | 'disabled' {
    if (this.#prefersReducedMotion && this.#program.reducedMotion === 'disable') {
      return 'disabled';
    }

    return this.#hidden ? 'suspended' : 'active';
  }

  #applyRendererActivity(): void {
    const activity = this.#getRendererActivity();

    for (const binding of this.#bindings.values()) {
      binding.renderer?.setActivity(activity);
    }
  }

  #destroyEnvironment(): void {
    this.#environment?.destroy();
    this.#environment = null;
    this.#hidden = false;
  }

  #selectBindings(bindingId: string | undefined): MutableBindingState[] {
    if (bindingId === undefined) {
      return [...this.#bindings.values()];
    }

    return [this.#getBinding(bindingId)];
  }

  #getBinding(bindingId: string): MutableBindingState {
    const binding = this.#bindings.get(bindingId);

    if (binding === undefined) {
      throw new FrameByFrameError(
        'INVALID_CONTROLLER',
        `Binding "${bindingId}" is not configured.`,
        {
          details: { bindingId },
        },
      );
    }

    return binding;
  }

  #getMountedRenderer(binding: MutableBindingState): VideoRenderer {
    const renderer = binding.renderer;

    if (renderer === null) {
      throw new FrameByFrameError(
        'INVALID_LIFECYCLE_OPERATION',
        'Media operations require a successfully mounted controller.',
        { details: { bindingId: binding.config.id, status: this.#status } },
      );
    }

    return renderer;
  }

  #assertMediaLifecycle(operation: string): void {
    this.#assertNotDestroyed();

    if (this.#status !== 'ready' && this.#status !== 'disabled') {
      throw new FrameByFrameError(
        'INVALID_LIFECYCLE_OPERATION',
        `${operation} requires a successfully mounted controller.`,
        { details: { status: this.#status } },
      );
    }
  }

  #subscribe(): void {
    if (
      this.#unsubscribe !== null ||
      !this.#enabled ||
      this.#hidden ||
      this.#scheduler === null ||
      !Object.values(this.#axes).some((axis) => axis.enabled)
    ) {
      return;
    }

    this.#unsubscribe = this.#scheduler.subscribe(this.#handleScroll);
  }

  #syncSubscription(): void {
    if (!this.#enabled || this.#hidden || !Object.values(this.#axes).some((axis) => axis.enabled)) {
      this.#unsubscribeFromSource();
      return;
    }

    this.#subscribe();
  }

  #unsubscribeFromSource(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  #transitionToRuntimeError(error: unknown): FrameByFrameError {
    const packageError = asPackageError(
      error,
      'INVALID_CONTROLLER',
      'The controller failed while resolving a scroll update.',
    );
    this.#unsubscribeFromSource();
    this.#destroyEnvironment();
    this.#destroyRenderers();
    this.#scheduler = null;
    this.#source = null;
    this.#status = 'error';
    this.#lastError = packageError;
    this.#events.emit('error', cloneError(packageError));
    return packageError;
  }

  #emitUpdate(reason: FrameByFrameUpdateReason): void {
    this.#events.emit('update', { reason, state: this.getState() });
  }

  #assertNotDestroyed(): void {
    if (this.#status === 'destroyed') {
      throw new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller has already been destroyed.',
      );
    }
  }
}

/** Internal factory with injectable browser dependencies for deterministic tests. */
export const createController = (
  options: FrameByFrameOptions,
  dependencies: ControllerDependencies,
): FrameByFrameController => new Controller(options, dependencies);
