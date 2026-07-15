import { describe, expect, it, vi } from 'vitest';

import { createControllerEnvironmentObserver } from '../src/responsive/environment-observer.js';
import { FakeFrameHost } from './helpers/fake-scroll-source.js';

import type { ControllerBreakpointConfig } from '../src/core/controller-config.js';
import type { ControllerEnvironmentObserverOptions } from '../src/responsive/environment-observer.js';

class FakeMediaQuery {
  matches: boolean;
  readonly listeners = new Set<() => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }

  emit(matches: boolean): void {
    this.matches = matches;

    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

class FakeResizeObserver {
  readonly callback: () => void;
  readonly observed: Element[] = [];
  disconnectCalls = 0;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class FakeBrowserView {
  readonly queries = new Map<string, FakeMediaQuery>();
  readonly resizeListeners = new Set<() => void>();
  readonly resizeObservers: FakeResizeObserver[] = [];
  ResizeObserver: new (callback: () => void) => FakeResizeObserver;

  constructor() {
    const observers = this.resizeObservers;
    this.ResizeObserver = class extends FakeResizeObserver {
      constructor(callback: () => void) {
        super(callback);
        observers.push(this);
      }
    };
  }

  matchMedia(query: string): FakeMediaQuery {
    const result = this.queries.get(query);

    if (result === undefined) {
      throw new Error(`Unexpected query: ${query}`);
    }

    return result;
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'resize') {
      this.resizeListeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === 'resize') {
      this.resizeListeners.delete(listener);
    }
  }

  emitResize(): void {
    for (const listener of [...this.resizeListeners]) {
      listener();
    }
  }
}

class FakeVisibilityDocument {
  readonly nodeType = 9;
  readonly documentElement: Element;
  readonly defaultView: FakeBrowserView | null;
  readonly listeners = new Set<() => void>();
  hidden = false;

  constructor(defaultView: FakeBrowserView | null, documentElement: Element) {
    this.defaultView = defaultView;
    this.documentElement = documentElement;
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'visibilitychange') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === 'visibilitychange') {
      this.listeners.delete(listener);
    }
  }

  emitVisibility(hidden: boolean): void {
    this.hidden = hidden;

    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

const createSource = (document: FakeVisibilityDocument): HTMLElement =>
  ({ nodeType: 1, ownerDocument: document }) as unknown as HTMLElement;

const breakpoints: readonly ControllerBreakpointConfig[] = [
  {
    id: 'wide',
    query: '(min-width: 900px)',
    override: Object.freeze({ axes: Object.freeze({}) }),
  },
  {
    id: 'compact',
    query: '(max-width: 600px)',
    override: Object.freeze({ axes: Object.freeze({}) }),
  },
];

describe('controller environment observer', () => {
  it('coalesces media and resize changes, observes targets, and follows visibility', async () => {
    const view = new FakeBrowserView();
    const wide = new FakeMediaQuery(true);
    const compact = new FakeMediaQuery(false);
    const reduced = new FakeMediaQuery(false);
    view.queries.set('(min-width: 900px)', wide);
    view.queries.set('(max-width: 600px)', compact);
    view.queries.set('(prefers-reduced-motion: reduce)', reduced);
    const sourceElement = { nodeType: 1 } as unknown as Element;
    const document = new FakeVisibilityDocument(view, sourceElement);
    const source = createSource(document);
    const frames = new FakeFrameHost();
    const mediaChanges = vi.fn();
    const resizes = vi.fn();
    const visibilityChanges = vi.fn();
    const observer = createControllerEnvironmentObserver({
      source,
      breakpoints,
      requestFrame: frames.requestAnimationFrame.bind(frames),
      cancelFrame: frames.cancelAnimationFrame.bind(frames),
      onMediaChange: mediaChanges,
      onResize: resizes,
      onVisibilityChange: visibilityChanges,
    });

    expect(observer.getSnapshot()).toEqual({
      activeBreakpoints: ['wide'],
      prefersReducedMotion: false,
      hidden: false,
    });

    wide.emit(false);
    compact.emit(true);
    reduced.emit(true);
    await Promise.resolve();
    expect(mediaChanges).toHaveBeenCalledOnce();
    expect(mediaChanges).toHaveBeenCalledWith({
      activeBreakpoints: ['compact'],
      prefersReducedMotion: true,
      hidden: false,
    });

    wide.emit(true);
    compact.emit(false);
    await Promise.resolve();
    expect(mediaChanges).toHaveBeenCalledTimes(2);

    const resizeObserver = view.resizeObservers[0];
    const target = { nodeType: 1 } as unknown as Element;
    observer.observeTargets([target]);
    view.emitResize();
    view.emitResize();
    resizeObserver?.callback();
    expect(frames.callbacks.size).toBe(1);
    frames.flush();
    expect(resizes).toHaveBeenCalledOnce();

    view.emitResize();
    document.emitVisibility(true);
    expect(frames.callbacks.size).toBe(0);
    expect(frames.cancelled).toHaveLength(1);
    expect(visibilityChanges).toHaveBeenLastCalledWith(true);
    view.emitResize();
    expect(frames.callbacks.size).toBe(0);
    document.emitVisibility(false);
    expect(visibilityChanges).toHaveBeenLastCalledWith(false);

    observer.destroy();
    observer.destroy();
    expect(wide.listeners).toHaveLength(0);
    expect(view.resizeListeners).toHaveLength(0);
    expect(document.listeners).toHaveLength(0);
    expect(resizeObserver?.disconnectCalls).toBe(1);
  });

  it('supports legacy media-query listeners and document scroll sources', async () => {
    const mediaListeners = new Set<() => void>();
    const legacyQuery = {
      matches: false,
      addListener: (listener: () => void): void => {
        mediaListeners.add(listener);
      },
      removeListener: (listener: () => void): void => {
        mediaListeners.delete(listener);
      },
    };
    const passiveQuery = { matches: false };
    const view = {
      matchMedia: (query: string) =>
        query === '(prefers-reduced-motion: reduce)' ? passiveQuery : legacyQuery,
    };
    const documentElement = { nodeType: 1 } as unknown as Element;
    const document = new FakeVisibilityDocument(
      view as unknown as FakeBrowserView,
      documentElement,
    );
    const frames = new FakeFrameHost();
    const mediaChanges = vi.fn();
    const wideBreakpoint = breakpoints[0];

    if (wideBreakpoint === undefined) {
      throw new Error('Expected a wide breakpoint fixture.');
    }

    const options: ControllerEnvironmentObserverOptions = {
      source: document as unknown as Document,
      breakpoints: [wideBreakpoint],
      requestFrame: frames.requestAnimationFrame.bind(frames),
      cancelFrame: frames.cancelAnimationFrame.bind(frames),
      onMediaChange: mediaChanges,
      onResize: vi.fn(),
      onVisibilityChange: vi.fn(),
    };
    const observer = createControllerEnvironmentObserver(options);

    legacyQuery.matches = true;

    for (const listener of mediaListeners) {
      listener();
    }

    await Promise.resolve();
    expect(mediaChanges).toHaveBeenCalledWith(
      expect.objectContaining({ activeBreakpoints: ['wide'] }),
    );
    observer.observeTargets([]);
    observer.destroy();
    expect(mediaListeners).toHaveLength(0);
  });

  it('reports invalid media queries without retaining partial observers', () => {
    const view = new FakeBrowserView();
    const wide = new FakeMediaQuery(false);
    view.queries.set('(min-width: 900px)', wide);
    const document = new FakeVisibilityDocument(view, { nodeType: 1 } as unknown as Element);
    const frames = new FakeFrameHost();

    expect(() =>
      createControllerEnvironmentObserver({
        source: createSource(document),
        breakpoints,
        requestFrame: frames.requestAnimationFrame.bind(frames),
        cancelFrame: frames.cancelAnimationFrame.bind(frames),
        onMediaChange: vi.fn(),
        onResize: vi.fn(),
        onVisibilityChange: vi.fn(),
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_BREAKPOINT_CONFIG' }));
    expect(wide.listeners).toHaveLength(0);
  });

  it('cleans up after preference query failures and tolerates unusable resize observers', () => {
    const frames = new FakeFrameHost();
    const wide = new FakeMediaQuery(false);
    const failingPreferenceView = {
      matchMedia: (query: string) => {
        if (query === '(prefers-reduced-motion: reduce)') {
          throw new Error('matchMedia failed');
        }

        return wide;
      },
    };
    const failingPreferenceDocument = new FakeVisibilityDocument(
      failingPreferenceView as unknown as FakeBrowserView,
      { nodeType: 1 } as unknown as Element,
    );
    const wideBreakpoint = breakpoints[0];

    if (wideBreakpoint === undefined) {
      throw new Error('Expected a wide breakpoint fixture.');
    }

    expect(() =>
      createControllerEnvironmentObserver({
        source: createSource(failingPreferenceDocument),
        breakpoints: [wideBreakpoint],
        requestFrame: frames.requestAnimationFrame.bind(frames),
        cancelFrame: frames.cancelAnimationFrame.bind(frames),
        onMediaChange: vi.fn(),
        onResize: vi.fn(),
        onVisibilityChange: vi.fn(),
      }),
    ).toThrow(expect.objectContaining({ code: 'ENVIRONMENT_UNAVAILABLE' }));
    expect(wide.listeners).toHaveLength(0);

    const view = new FakeBrowserView();
    view.queries.set('(prefers-reduced-motion: reduce)', new FakeMediaQuery(false));
    view.ResizeObserver = class {
      constructor() {
        throw new Error('ResizeObserver failed');
      }

      observe(): void {
        return undefined;
      }

      disconnect(): void {
        return undefined;
      }
    } as never;
    const document = new FakeVisibilityDocument(view, { nodeType: 1 } as unknown as Element);
    const observer = createControllerEnvironmentObserver({
      source: createSource(document),
      breakpoints: [],
      requestFrame: frames.requestAnimationFrame.bind(frames),
      cancelFrame: frames.cancelAnimationFrame.bind(frames),
      onMediaChange: vi.fn(),
      onResize: vi.fn(),
      onVisibilityChange: vi.fn(),
    });
    observer.observeTargets([{ nodeType: 1 } as unknown as Element]);
    observer.destroy();
  });
});
