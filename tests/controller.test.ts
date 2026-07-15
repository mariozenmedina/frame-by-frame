import { describe, expect, it, vi } from 'vitest';

import { createController } from '../src/core/controller.js';
import { FrameByFrameError } from '../src/core/errors.js';
import { resolveScrollSource } from '../src/scroll/source.js';
import { SourceRegistry } from '../src/scroll/source-scheduler.js';
import { createFrameByFrame } from '../src/index.js';
import { createFakeScrollEnvironment } from './helpers/fake-scroll-source.js';

import type { ControllerDependencies } from '../src/core/controller.js';
import type {
  VideoRenderer,
  VideoRendererEvent,
  VideoRendererState,
} from '../src/media/video-renderer.js';
import type {
  FrameByFrameErrorInfo,
  FrameByFrameFrameEvent,
  FrameByFrameLoadedMetadataEvent,
  FrameByFrameOptions,
  TimelineResolution,
} from '../src/types.js';

const createTargetReference = (): HTMLVideoElement => {
  const attributes = new Map<string, string>();
  const listeners = new Map<string, Set<EventListener>>();

  return {
    nodeType: 1,
    localName: 'video',
    currentTime: 0,
    duration: Number.NaN,
    error: null,
    srcObject: null,
    muted: false,
    defaultMuted: false,
    playsInline: false,
    controls: false,
    loop: false,
    autoplay: false,
    preload: '',
    poster: '',
    crossOrigin: null,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        const set = listeners.get(type) ?? new Set<EventListener>();
        set.add(listener);
        listeners.set(type, set);
      }
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.get(type)?.delete(listener);
      }
    },
    canPlayType: () => 'probably',
    load: () => undefined,
    pause: () => undefined,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
    removeAttribute: (name: string) => {
      attributes.delete(name);
    },
  } as unknown as HTMLVideoElement;
};

const createClip = (id: string) => ({ id, sources: [{ src: `${id}.mp4` }] });

class TestVideoRenderer implements VideoRenderer {
  readonly target: HTMLVideoElement;
  readonly resolutions: (TimelineResolution | null)[] = [];
  readonly onEvent: (event: VideoRendererEvent) => void;
  loadCalls = 0;
  unloadCalls = 0;
  destroyCalls = 0;
  state: VideoRendererState = {
    loadState: 'idle',
    activeClipId: null,
    selectedSource: null,
    duration: null,
    appliedTime: null,
    presentedTime: null,
    seeking: false,
    error: null,
  };

  constructor(target: HTMLVideoElement, onEvent: (event: VideoRendererEvent) => void) {
    this.target = target;
    this.onEvent = onEvent;
  }

  setResolution(resolution: TimelineResolution | null): void {
    this.resolutions.push(resolution);
  }

  load(): Promise<void> {
    this.loadCalls += 1;
    return Promise.resolve();
  }

  unload(): void {
    this.unloadCalls += 1;
    this.state = { ...this.state, loadState: 'unloaded' };
  }

  getTarget(): HTMLVideoElement {
    return this.target;
  }

  getState(): VideoRendererState {
    return this.state;
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.state = { ...this.state, loadState: 'unloaded' };
  }
}

const createOptions = (source: HTMLElement): FrameByFrameOptions => ({
  source,
  axes: {
    x: {
      enabled: false,
      bindings: [
        {
          id: 'horizontal',
          target: createTargetReference(),
          clips: [createClip('horizontal')],
          segments: [{ media: [0, 5], scroll: [0, 100] }],
        },
      ],
    },
    y: {
      bindings: [
        {
          id: 'pixels',
          target: createTargetReference(),
          clips: [createClip('intro')],
          segments: [{ clip: 'intro', media: [0, 10], scroll: [0, 100] }],
        },
        {
          id: 'progress',
          target: createTargetReference(),
          clips: [createClip('ending')],
          segments: [
            {
              clip: 'ending',
              media: [10, 20],
              scroll: [0, 1],
              scrollUnit: 'progress',
            },
          ],
        },
      ],
    },
  },
});

const createDependencies = (
  errors: unknown[] = [],
): {
  readonly dependencies: ControllerDependencies;
  readonly environment: ReturnType<typeof createFakeScrollEnvironment>;
  readonly renderers: TestVideoRenderer[];
} => {
  const environment = createFakeScrollEnvironment();
  const renderers: TestVideoRenderer[] = [];
  const reportAsyncError = (error: unknown): void => {
    errors.push(error);
  };

  return {
    environment,
    renderers,
    dependencies: {
      resolveSource: resolveScrollSource,
      sourceRegistry: new SourceRegistry(reportAsyncError),
      reportAsyncError,
      createVideoRenderer: (config, onEvent) => {
        const renderer = new TestVideoRenderer(config.target as HTMLVideoElement, onEvent);
        renderers.push(renderer);
        return renderer;
      },
    },
  };
};

describe('createFrameByFrame controller', () => {
  it('compiles configuration immediately without touching the DOM', async () => {
    const controller = createFrameByFrame({
      axes: {
        y: {
          bindings: [
            {
              id: 'intro',
              target: '#intro',
              clips: [createClip('intro')],
              segments: [{ media: [0, 1], scroll: [0, 1] }],
            },
          ],
        },
      },
    });

    expect(controller.getState()).toMatchObject({ status: 'idle', source: null });
    await expect(controller.mount()).rejects.toMatchObject({ code: 'ENVIRONMENT_UNAVAILABLE' });
    expect(controller.getState()).toMatchObject({ status: 'error', source: null });
  });

  it('mounts once, resolves pixel and progress bindings, and coalesces scroll updates', async () => {
    const { dependencies, environment } = createDependencies();
    environment.element.scrollHeight = 300;
    environment.element.clientHeight = 100;
    environment.element.scrollTop = 50;
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );
    const updates = vi.fn();
    controller.on('update', updates);

    const firstMount = controller.mount();
    const secondMount = controller.mount();
    expect(firstMount).toBe(secondMount);
    await firstMount;
    await controller.mount();

    expect(controller.getState()).toMatchObject({
      status: 'ready',
      enabled: true,
      source: environment.element,
      axes: {
        x: { enabled: false, max: 0, offset: 0, progress: 0 },
        y: { enabled: true, max: 200, offset: 50, progress: 0.25 },
      },
      bindings: {
        horizontal: { axis: 'x', resolution: null },
        pixels: { axis: 'y', resolution: { clipId: 'intro', targetTime: 5 } },
        progress: { axis: 'y', resolution: { clipId: 'ending', targetTime: 12.5 } },
      },
    });

    environment.element.scrollTop = 100;
    environment.element.emitScroll();
    environment.element.emitScroll();
    expect(updates).toHaveBeenCalledTimes(1);
    environment.frameHost.flush();
    expect(updates).toHaveBeenCalledTimes(2);
    expect(controller.getState().bindings['progress']?.resolution?.targetTime).toBe(15);
  });

  it('shares one source listener across controllers', async () => {
    const { dependencies, environment } = createDependencies();
    const options = createOptions(environment.element as unknown as HTMLElement);
    const first = createController(options, dependencies);
    const second = createController(options, dependencies);

    await first.mount();
    await second.mount();
    expect(environment.element.listeners).toHaveLength(1);

    first.disable();
    expect(environment.element.listeners).toHaveLength(1);
    second.destroy();
    expect(environment.element.listeners).toHaveLength(0);
    first.destroy();
  });

  it('supports disable before mount, enable synchronization, refresh, and idempotent destroy', async () => {
    const { dependencies, environment } = createDependencies();
    environment.element.scrollHeight = 200;
    environment.element.clientHeight = 100;
    environment.element.scrollTop = 25;
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );
    const reasons: string[] = [];
    controller.on('update', ({ reason }) => {
      reasons.push(reason);
    });
    controller.disable();
    await controller.mount();

    expect(controller.getState()).toMatchObject({ status: 'disabled', enabled: false });
    expect(controller.getState().bindings['pixels']?.resolution).toBeNull();
    expect(environment.element.listeners).toHaveLength(0);

    controller.enable();
    expect(controller.getState()).toMatchObject({ status: 'ready', enabled: true });
    expect(controller.getState().bindings['pixels']?.resolution?.targetTime).toBe(2.5);
    expect(environment.element.listeners).toHaveLength(1);

    environment.element.scrollHeight = 300;
    controller.refresh();
    expect(controller.getState().axes.y?.max).toBe(200);

    controller.disable();
    controller.disable();
    controller.refresh();
    expect(controller.getState().bindings['pixels']?.resolution).toBeNull();
    expect(reasons).toEqual(['disable', 'mount', 'enable', 'refresh', 'disable', 'refresh']);

    const destroyed = vi.fn();
    controller.on('destroy', destroyed);
    controller.destroy();
    controller.destroy();
    expect(destroyed).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      status: 'destroyed',
      enabled: false,
      source: null,
    });
  });

  it('exposes mounted media targets and binding-scoped load controls', async () => {
    const { dependencies, environment, renderers } = createDependencies();
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );

    expect(controller.getTarget('pixels')).toBeNull();
    await controller.mount();
    expect(controller.getTarget('pixels')).toBe(renderers[1]?.target);

    await controller.load('pixels');
    expect(renderers.map(({ loadCalls }) => loadCalls)).toEqual([0, 1, 0]);
    await controller.load();
    expect(renderers.map(({ loadCalls }) => loadCalls)).toEqual([1, 2, 1]);

    controller.unload('progress');
    expect(renderers.map(({ unloadCalls }) => unloadCalls)).toEqual([0, 0, 1]);
    controller.unload();
    expect(renderers.map(({ unloadCalls }) => unloadCalls)).toEqual([1, 1, 2]);
    expect(() => controller.getTarget('missing')).toThrow(
      expect.objectContaining({ code: 'INVALID_CONTROLLER' }),
    );

    controller.destroy();
    expect(renderers.map(({ destroyCalls }) => destroyCalls)).toEqual([1, 1, 1]);
  });

  it('forwards media events with current binding state without failing the controller', async () => {
    const { dependencies, environment, renderers } = createDependencies();
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );
    const loadedMetadata = vi.fn<(event: FrameByFrameLoadedMetadataEvent) => void>();
    const frames = vi.fn<(event: FrameByFrameFrameEvent) => void>();
    const errors = vi.fn<(error: FrameByFrameErrorInfo) => void>();
    controller.on('loadedmetadata', loadedMetadata);
    controller.on('frame', frames);
    controller.on('error', errors);
    await controller.mount();
    const renderer = renderers[1];

    if (renderer === undefined) {
      throw new Error('Expected the pixels renderer to be mounted.');
    }

    renderer.state = {
      ...renderer.state,
      loadState: 'metadata',
      activeClipId: 'intro',
      selectedSource: 'intro.mp4',
      duration: 8,
      appliedTime: 2,
      presentedTime: 2.01,
    };
    renderer.onEvent({ type: 'loadstart', clipId: 'intro' });
    renderer.onEvent({ type: 'loadedmetadata', clipId: 'intro', duration: 8 });
    renderer.onEvent({ type: 'loadready', clipId: 'intro' });
    renderer.onEvent({
      type: 'seekrequest',
      clipId: 'intro',
      requestedTime: 2,
      targetTime: 2,
    });
    renderer.onEvent({
      type: 'frame',
      clipId: 'intro',
      presentedTime: 2.01,
      expectedDisplayTime: 16,
      width: 1920,
      height: 1080,
    });

    const metadataEvent = loadedMetadata.mock.calls.at(-1)?.[0];
    expect(metadataEvent).toMatchObject({
      bindingId: 'pixels',
      clipId: 'intro',
      duration: 8,
    });
    expect(metadataEvent?.state.status).toBe('ready');
    expect(frames).toHaveBeenCalledWith(
      expect.objectContaining({ presentedTime: 2.01, width: 1920, height: 1080 }),
    );

    const mediaError = new FrameByFrameError('MEDIA_LOAD_FAILED', 'load failed', {
      details: { bindingId: 'pixels', clipId: 'intro' },
    });
    renderer.state = { ...renderer.state, loadState: 'error', error: mediaError };
    renderer.onEvent({ type: 'error', error: mediaError });

    expect(controller.getState()).toMatchObject({
      status: 'ready',
      lastError: null,
      bindings: { pixels: { loadState: 'error', error: { code: 'MEDIA_LOAD_FAILED' } } },
    });
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ code: 'MEDIA_LOAD_FAILED' }));
  });

  it('cleans up already-created renderers when target setup fails during mount', async () => {
    const { dependencies, environment } = createDependencies();
    const created: TestVideoRenderer[] = [];
    let attempts = 0;
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      {
        ...dependencies,
        createVideoRenderer: (config, onEvent) => {
          attempts += 1;

          if (attempts === 2) {
            throw new FrameByFrameError('TARGET_NOT_FOUND', 'missing target');
          }

          const renderer = new TestVideoRenderer(config.target as HTMLVideoElement, onEvent);
          created.push(renderer);
          return renderer;
        },
      },
    );

    await expect(controller.mount()).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND' });
    expect(created[0]?.destroyCalls).toBe(1);
    expect(controller.getState()).toMatchObject({
      status: 'error',
      lastError: { code: 'TARGET_NOT_FOUND' },
    });
  });

  it('rejects invalid lifecycle operations and all post-destroy operations except state reads', () => {
    const { dependencies, environment } = createDependencies();
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );

    expect(() => {
      controller.refresh();
    }).toThrow(expect.objectContaining({ code: 'INVALID_LIFECYCLE_OPERATION' }));
    expect(() => {
      void controller.load();
    }).toThrow(expect.objectContaining({ code: 'INVALID_LIFECYCLE_OPERATION' }));
    expect(() => {
      controller.unload();
    }).toThrow(expect.objectContaining({ code: 'INVALID_LIFECYCLE_OPERATION' }));
    controller.destroy();

    expect(controller.getState().status).toBe('destroyed');
    expect(() => {
      controller.enable();
    }).toThrow(expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }));
    expect(() => {
      controller.disable();
    }).toThrow(expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }));
    expect(() => {
      controller.refresh();
    }).toThrow(expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }));
    expect(() => {
      void controller.load();
    }).toThrow(expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }));
    expect(() => {
      controller.unload();
    }).toThrow(expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }));
    expect(() => {
      controller.getTarget('pixels');
    }).toThrow(expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }));
    expect(() => controller.on('mount', vi.fn())).toThrow(
      expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }),
    );
    expect(() => controller.mount()).toThrow(
      expect.objectContaining({ code: 'CONTROLLER_DESTROYED' }),
    );
  });

  it('invalidates a pending mount when destroyed', async () => {
    const { dependencies, environment } = createDependencies();
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );

    const mounting = controller.mount();
    expect(controller.getState().status).toBe('mounting');
    controller.destroy();

    await expect(mounting).rejects.toMatchObject({ code: 'CONTROLLER_DESTROYED' });
    expect(controller.getState().status).toBe('destroyed');
  });

  it('can retry mount after a source failure while preserving the original cause', async () => {
    const errors: unknown[] = [];
    const { dependencies, environment } = createDependencies(errors);
    const cause = new Error('temporary failure');
    let attempts = 0;
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      {
        ...dependencies,
        resolveSource: (source) => {
          attempts += 1;

          if (attempts === 1) {
            throw cause;
          }

          return resolveScrollSource(source);
        },
      },
    );
    const emitted = vi.fn();
    controller.on('error', emitted);

    await expect(controller.mount()).rejects.toMatchObject({
      code: 'SOURCE_NOT_FOUND',
      cause,
    });
    const firstErrorState = controller.getState();
    const secondErrorState = controller.getState();
    expect(firstErrorState).toMatchObject({ status: 'error', lastError: { cause } });
    expect(firstErrorState.lastError).not.toBe(secondErrorState.lastError);
    await controller.mount();
    expect(controller.getState()).toMatchObject({ status: 'ready', lastError: null });
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('resolves configured source functions only during mount', async () => {
    const { dependencies, environment } = createDependencies();
    const resolver = vi.fn(() => environment.element as unknown as HTMLElement);
    const options = createOptions(environment.element as unknown as HTMLElement);
    const controller = createController({ ...options, source: resolver }, dependencies);

    expect(resolver).not.toHaveBeenCalled();
    await controller.mount();
    expect(resolver).toHaveBeenCalledOnce();
  });

  it('returns detached readonly state snapshots', async () => {
    const { dependencies, environment } = createDependencies();
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );
    await controller.mount();
    const first = controller.getState();
    const second = controller.getState();

    expect(first).not.toBe(second);
    expect(first.axes).not.toBe(second.axes);
    expect(first.bindings['pixels']).not.toBe(second.bindings['pixels']);
    expect(first.bindings['pixels']?.resolution).not.toBe(second.bindings['pixels']?.resolution);
    expect(Object.isFrozen(first.bindings)).toBe(true);
    expect(Object.isFrozen(first.bindings['pixels']?.resolution)).toBe(true);
    expect(first.activeBreakpoints).toEqual([]);
  });

  it('isolates public listener errors and validates listeners', async () => {
    const errors: unknown[] = [];
    const { dependencies, environment } = createDependencies(errors);
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );
    const expected = new Error('listener failed');
    const successful = vi.fn();
    const unsubscribe = controller.on('mount', () => {
      throw expected;
    });
    controller.on('mount', successful);

    await controller.mount();
    unsubscribe();
    unsubscribe();

    expect(errors).toEqual([expected]);
    expect(successful).toHaveBeenCalledOnce();
    expect(() => controller.on('mount', null as never)).toThrow(
      expect.objectContaining({ code: 'INVALID_CONTROLLER' }),
    );
  });

  it('reports public listener failures through a microtask', async () => {
    const environment = createFakeScrollEnvironment();
    const originalQueueMicrotask = globalThis.queueMicrotask;
    let queued: (() => void) | null = null;
    globalThis.queueMicrotask = (callback): void => {
      queued = callback;
    };
    const expected = new Error('public listener failed');
    const controller = createFrameByFrame({
      source: environment.element as unknown as HTMLElement,
      axes: {
        y: {
          bindings: [
            {
              id: 'public',
              target: createTargetReference(),
              clips: [createClip('public')],
              segments: [{ media: [0, 1], scroll: [0, 1] }],
            },
          ],
        },
      },
    });
    controller.on('mount', () => {
      throw expected;
    });

    try {
      await controller.mount();
      expect(queued).not.toBeNull();
      expect(() => {
        (queued as unknown as () => void)();
      }).toThrow(expected);
    } finally {
      controller.destroy();
      globalThis.queueMicrotask = originalQueueMicrotask;
    }
  });

  it('enters error state and unsubscribes after a runtime mapping failure', async () => {
    const { dependencies, environment, renderers } = createDependencies();
    environment.element.scrollHeight = 200;
    environment.element.clientHeight = 100;
    const controller = createController(
      {
        source: environment.element as unknown as HTMLElement,
        axes: {
          y: {
            bindings: [
              {
                id: 'failing',
                target: createTargetReference(),
                clips: [createClip('failing')],
                easing: () => {
                  throw new Error('easing failed');
                },
                segments: [{ media: [0, 1], scroll: [10, 100] }],
              },
            ],
          },
        },
      },
      dependencies,
    );
    const emitted = vi.fn();
    controller.on('error', emitted);
    await controller.mount();

    environment.element.scrollTop = 50;
    environment.element.emitScroll();
    environment.frameHost.flush();

    expect(controller.getState()).toMatchObject({
      status: 'error',
      lastError: { code: 'INVALID_EASING_RESULT' },
    });
    expect(environment.element.listeners).toHaveLength(0);
    expect(emitted).toHaveBeenCalledOnce();
    expect(renderers[0]?.destroyCalls).toBe(1);

    environment.element.scrollTop = 0;
    await controller.mount();
    expect(controller.getState()).toMatchObject({ status: 'ready', lastError: null });
    expect(renderers).toHaveLength(2);
  });
});

describe('controller configuration', () => {
  const validBinding = {
    id: 'binding',
    target: createTargetReference(),
    clips: [createClip('binding')],
    segments: [{ media: [0, 1], scroll: [0, 1] }],
  } as const;

  it.each([
    [null, 'INVALID_CONTROLLER'],
    [{ axes: null }, 'INVALID_CONTROLLER'],
    [{ axes: {} }, 'INVALID_CONTROLLER'],
    [{ axes: { x: true } }, 'INVALID_CONTROLLER'],
    [{ axes: { x: { bindings: [] } } }, 'INVALID_CONTROLLER'],
    [{ axes: { x: { bindings: [null] } } }, 'INVALID_CONTROLLER'],
    [{ axes: { x: { bindings: [{ ...validBinding, id: ' ' }] } } }, 'INVALID_CONTROLLER'],
    [{ axes: { x: { bindings: [validBinding], enabled: 'yes' } } }, 'INVALID_CONTROLLER'],
  ])('rejects invalid controller shape %#', (options, code) => {
    expect(() => createFrameByFrame(options as never)).toThrow(expect.objectContaining({ code }));
  });

  it('rejects duplicate IDs across axes', () => {
    expect(() =>
      createFrameByFrame({
        axes: {
          x: { bindings: [validBinding] },
          y: { bindings: [validBinding] },
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_BINDING_ID' }));
  });

  it('accepts false axes while requiring at least one configured binding', () => {
    expect(() =>
      createFrameByFrame({ axes: { x: false, y: { bindings: [validBinding] } } }),
    ).not.toThrow();
    expect(() => createFrameByFrame({ axes: { x: false, y: false } })).toThrow(
      expect.objectContaining({ code: 'INVALID_CONTROLLER' }),
    );
  });

  it.each([
    [{ ...validBinding, renderer: 'canvas' }, 'INVALID_MEDIA_CONFIG'],
    [{ ...validBinding, target: undefined }, 'INVALID_MEDIA_CONFIG'],
    [{ ...validBinding, mountTo: {}, target: {} }, 'INVALID_MEDIA_CONFIG'],
    [{ ...validBinding, target: 1 }, 'INVALID_MEDIA_CONFIG'],
    [{ ...validBinding, clips: [] }, 'INVALID_MEDIA_CONFIG'],
    [{ ...validBinding, clips: [createClip('same'), createClip('same')] }, 'INVALID_MEDIA_CONFIG'],
    [
      { ...validBinding, clips: [{ id: '', sources: [{ src: '/video.mp4' }] }] },
      'INVALID_MEDIA_CONFIG',
    ],
    [{ ...validBinding, clips: [{ id: 'clip', sources: [] }] }, 'INVALID_MEDIA_CONFIG'],
    [
      { ...validBinding, clips: [{ id: 'clip', sources: [{ src: '', type: 'video/mp4' }] }] },
      'INVALID_MEDIA_CONFIG',
    ],
    [
      { ...validBinding, clips: [{ id: 'clip', sources: [{ src: '/video', type: '' }] }] },
      'INVALID_MEDIA_CONFIG',
    ],
    [{ ...validBinding, video: { muted: 'yes' } }, 'INVALID_MEDIA_CONFIG'],
    [{ ...validBinding, seek: { timeEpsilon: -1 } }, 'INVALID_MEDIA_CONFIG'],
  ])('rejects invalid media configuration %#', (binding, code) => {
    expect(() => createFrameByFrame({ axes: { y: { bindings: [binding as never] } } })).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it('requires explicit, known clip IDs for multi-clip timelines', () => {
    const clips = [createClip('intro'), createClip('detail')];

    expect(() =>
      createFrameByFrame({
        axes: { y: { bindings: [{ ...validBinding, clips }] } },
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MEDIA_CONFIG' }));

    expect(() =>
      createFrameByFrame({
        axes: {
          y: {
            bindings: [
              {
                ...validBinding,
                clips,
                segments: [{ clip: 'missing', media: [0, 1], scroll: [0, 1] }],
              },
            ],
          },
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MEDIA_CONFIG' }));
  });

  it('keeps FrameByFrameError details immutable', () => {
    const details = { field: 'source' };
    const error = new FrameByFrameError('INVALID_CONTROLLER', 'invalid', { details });
    details.field = 'changed';
    expect(error.details).toEqual({ field: 'source' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });
});
