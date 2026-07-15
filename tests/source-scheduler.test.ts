import { describe, expect, it, vi } from 'vitest';

import { SourceRegistry, SourceScheduler } from '../src/scroll/source-scheduler.js';
import { resolveScrollSource } from '../src/scroll/source.js';
import { createFakeScrollEnvironment } from './helpers/fake-scroll-source.js';

describe('SourceScheduler', () => {
  it('shares one passive listener and one animation frame across subscribers', () => {
    const environment = createFakeScrollEnvironment();
    environment.element.scrollWidth = 300;
    environment.element.clientWidth = 100;
    environment.element.scrollHeight = 500;
    environment.element.clientHeight = 100;
    const first = vi.fn();
    const second = vi.fn();
    const scheduler = new SourceScheduler(environment.resolved, vi.fn());

    expect(scheduler.refresh()).toEqual({
      x: { offset: 0, max: 200, progress: 0 },
      y: { offset: 0, max: 400, progress: 0 },
    });
    const unsubscribeFirst = scheduler.subscribe(first);
    const unsubscribeSecond = scheduler.subscribe(second);

    expect(environment.element.listeners).toHaveLength(1);
    expect(environment.element.listenerOptions).toEqual([{ passive: true }]);

    environment.element.scrollLeft = 50;
    environment.element.scrollTop = 100;
    environment.element.emitScroll();
    environment.element.emitScroll();

    expect(environment.frameHost.callbacks).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();

    environment.frameHost.flush();

    expect(first).toHaveBeenCalledWith({
      x: { offset: 50, max: 200, progress: 0.25 },
      y: { offset: 100, max: 400, progress: 0.25 },
    });
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    unsubscribeFirst();
    expect(environment.element.listeners).toHaveLength(1);
    unsubscribeSecond();
    expect(environment.element.listeners).toHaveLength(0);
  });

  it('does no metric work in the raw listener and cancels an obsolete frame', () => {
    const environment = createFakeScrollEnvironment();
    let offsetReads = 0;
    const resolved = {
      ...environment.resolved,
      metricsTarget: {
        get scrollLeft(): number {
          offsetReads += 1;
          return 0;
        },
        get scrollTop(): number {
          offsetReads += 1;
          return 0;
        },
        scrollWidth: 100,
        scrollHeight: 100,
        clientWidth: 100,
        clientHeight: 100,
      },
    };
    const scheduler = new SourceScheduler(resolved, vi.fn());
    scheduler.refresh();
    offsetReads = 0;
    const unsubscribe = scheduler.subscribe(vi.fn());

    environment.element.emitScroll();
    expect(offsetReads).toBe(0);
    unsubscribe();

    expect(environment.frameHost.cancelled).toEqual([1]);
  });

  it('normalizes non-finite and zero-range metrics', () => {
    const environment = createFakeScrollEnvironment();
    environment.element.scrollLeft = Number.NaN;
    environment.element.scrollTop = Number.POSITIVE_INFINITY;
    environment.element.scrollWidth = Number.NaN;
    environment.element.scrollHeight = 50;
    environment.element.clientHeight = 100;

    const scheduler = new SourceScheduler(environment.resolved, vi.fn());

    expect(scheduler.refresh()).toEqual({
      x: { offset: 0, max: 0, progress: 0 },
      y: { offset: 0, max: 0, progress: 0 },
    });
  });

  it('isolates subscriber failures and reuses one registry scheduler', () => {
    const environment = createFakeScrollEnvironment();
    const errors: unknown[] = [];
    const registry = new SourceRegistry((error) => errors.push(error));
    const scheduler = registry.get(environment.resolved);
    const expected = new Error('subscriber failed');
    const successful = vi.fn();
    scheduler.refresh();
    scheduler.subscribe(() => {
      throw expected;
    });
    scheduler.subscribe(successful);

    environment.element.emitScroll();
    environment.frameHost.flush();

    expect(errors).toEqual([expected]);
    expect(successful).toHaveBeenCalledOnce();
    expect(registry.get(environment.resolved)).toBe(scheduler);
  });

  it('attaches to and detaches from a canonical document source', () => {
    const environment = createFakeScrollEnvironment();
    const resolved = resolveScrollSource(environment.document);
    const scheduler = new SourceScheduler(resolved, vi.fn());
    scheduler.refresh();

    const unsubscribe = scheduler.subscribe(vi.fn());
    expect(environment.document.listeners).toHaveLength(1);
    unsubscribe();
    expect(environment.document.listeners).toHaveLength(0);
  });

  it('rolls back a subscription when listener attachment fails', () => {
    const environment = createFakeScrollEnvironment();
    const cause = new Error('listener attachment failed');
    const scheduler = new SourceScheduler(
      {
        ...environment.resolved,
        eventTarget: {
          addEventListener: () => {
            throw cause;
          },
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        },
      },
      vi.fn(),
    );

    expect(() => scheduler.subscribe(vi.fn())).toThrow(cause);
  });
});
