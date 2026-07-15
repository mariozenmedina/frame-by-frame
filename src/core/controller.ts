import { EventEmitter } from './event-emitter.js';
import { FrameByFrameError } from './errors.js';
import { compileControllerConfig } from './controller-config.js';

import type { ControllerBindingConfig, ControllerConfig } from './controller-config.js';
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
}

interface MutableAxisState {
  readonly enabled: boolean;
  offset: number;
  max: number;
  progress: number;
}

interface MutableBindingState {
  readonly config: ControllerBindingConfig;
  resolution: TimelineResolution | null;
}

const EMPTY_BREAKPOINTS: readonly string[] = Object.freeze([]);

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
  readonly #config: ControllerConfig;
  readonly #dependencies: ControllerDependencies;
  readonly #events: EventEmitter<FrameByFrameEventMap>;
  readonly #axes: Partial<Record<AxisName, MutableAxisState>> = {};
  readonly #bindings = new Map<string, MutableBindingState>();
  readonly #handleScroll = (snapshot: ScrollSourceSnapshot): void => {
    if (this.#status !== 'ready' || !this.#enabled) {
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

  constructor(options: FrameByFrameOptions, dependencies: ControllerDependencies) {
    this.#config = compileControllerConfig(options);
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
      this.#bindings.set(binding.id, { config: binding, resolution: null });
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
      bindings[id] = Object.freeze({
        id,
        axis: binding.config.axis,
        resolution: binding.resolution === null ? null : cloneResolution(binding.resolution),
      });
    }

    return Object.freeze({
      status: this.#status,
      enabled: this.#enabled,
      source: this.#source,
      activeBreakpoints: EMPTY_BREAKPOINTS,
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

    if (generation !== this.#mountGeneration || this.#status === 'destroyed') {
      throw new FrameByFrameError(
        'CONTROLLER_DESTROYED',
        'The controller was destroyed before mount completed.',
      );
    }

    this.#source = resolvedSource.publicSource;
    this.#scheduler = scheduler;
    this.#applySnapshot(snapshot, this.#enabled);
    this.#status = this.#enabled ? 'ready' : 'disabled';
    this.#subscribe();

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

      if (!resolveBindings || !axis?.enabled) {
        binding.resolution = null;
        continue;
      }

      const position = binding.config.timeline.unit === 'px' ? axis.offset : axis.progress;
      binding.resolution = binding.config.timeline.resolve(position);
    }
  }

  #subscribe(): void {
    if (
      this.#unsubscribe !== null ||
      !this.#enabled ||
      this.#scheduler === null ||
      !Object.values(this.#axes).some((axis) => axis.enabled)
    ) {
      return;
    }

    this.#unsubscribe = this.#scheduler.subscribe(this.#handleScroll);
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
