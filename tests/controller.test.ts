import { describe, expect, it, vi } from 'vitest';

import { createController } from '../src/core/controller.js';
import { FrameByFrameError } from '../src/core/errors.js';
import { resolveScrollSource } from '../src/scroll/source.js';
import { SourceRegistry } from '../src/scroll/source-scheduler.js';
import { createFrameByFrame } from '../src/index.js';
import { createFakeScrollEnvironment } from './helpers/fake-scroll-source.js';

import type { ControllerDependencies } from '../src/core/controller.js';
import type { FrameByFrameOptions } from '../src/types.js';

const createOptions = (source: HTMLElement): FrameByFrameOptions => ({
  source,
  axes: {
    x: {
      enabled: false,
      bindings: [
        {
          id: 'horizontal',
          segments: [{ media: [0, 5], scroll: [0, 100] }],
        },
      ],
    },
    y: {
      bindings: [
        {
          id: 'pixels',
          segments: [{ clip: 'intro', media: [0, 10], scroll: [0, 100] }],
        },
        {
          id: 'progress',
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
} => {
  const environment = createFakeScrollEnvironment();
  const reportAsyncError = (error: unknown): void => {
    errors.push(error);
  };

  return {
    environment,
    dependencies: {
      resolveSource: resolveScrollSource,
      sourceRegistry: new SourceRegistry(reportAsyncError),
      reportAsyncError,
    },
  };
};

describe('createFrameByFrame controller', () => {
  it('compiles configuration immediately without touching the DOM', async () => {
    const controller = createFrameByFrame({
      axes: {
        y: {
          bindings: [{ id: 'intro', segments: [{ media: [0, 1], scroll: [0, 1] }] }],
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

  it('rejects invalid lifecycle operations and all post-destroy operations except state reads', () => {
    const { dependencies, environment } = createDependencies();
    const controller = createController(
      createOptions(environment.element as unknown as HTMLElement),
      dependencies,
    );

    expect(() => {
      controller.refresh();
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
          bindings: [{ id: 'public', segments: [{ media: [0, 1], scroll: [0, 1] }] }],
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
    const { dependencies, environment } = createDependencies();
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
  });
});

describe('controller configuration', () => {
  const validBinding = {
    id: 'binding',
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

  it('keeps FrameByFrameError details immutable', () => {
    const details = { field: 'source' };
    const error = new FrameByFrameError('INVALID_CONTROLLER', 'invalid', { details });
    details.field = 'changed';
    expect(error.details).toEqual({ field: 'source' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });
});
