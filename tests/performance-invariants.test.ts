import { describe, expect, it, vi } from 'vitest';

import { SourceScheduler } from '../src/scroll/source-scheduler.js';
import { createFakeScrollEnvironment } from './helpers/fake-scroll-source.js';

describe('deterministic performance invariants', () => {
  it('keeps scroll-burst work constant across event and subscriber counts', () => {
    const environment = createFakeScrollEnvironment();
    let metricReads = 0;
    let frameRequests = 0;
    const metricsTarget = {
      get scrollLeft(): number {
        metricReads += 1;
        return 50;
      },
      get scrollTop(): number {
        metricReads += 1;
        return 100;
      },
      get scrollWidth(): number {
        metricReads += 1;
        return 300;
      },
      get scrollHeight(): number {
        metricReads += 1;
        return 500;
      },
      get clientWidth(): number {
        metricReads += 1;
        return 100;
      },
      get clientHeight(): number {
        metricReads += 1;
        return 100;
      },
    };
    const scheduler = new SourceScheduler(
      {
        ...environment.resolved,
        metricsTarget,
        requestFrame: (callback): number => {
          frameRequests += 1;
          return environment.frameHost.requestAnimationFrame(callback);
        },
      },
      vi.fn(),
    );

    scheduler.refresh();
    expect(metricReads).toBe(6);
    metricReads = 0;

    const subscribers = Array.from({ length: 100 }, () => vi.fn());
    const unsubscribers = subscribers.map((subscriber) => scheduler.subscribe(subscriber));
    expect(environment.element.listeners).toHaveLength(1);

    for (let index = 0; index < 1_000; index += 1) {
      environment.element.emitScroll();
    }

    expect(frameRequests).toBe(1);
    expect(environment.frameHost.callbacks).toHaveLength(1);
    expect(metricReads).toBe(0);

    environment.frameHost.flush();

    expect(metricReads).toBe(2);
    for (const subscriber of subscribers) {
      expect(subscriber).toHaveBeenCalledOnce();
    }

    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    expect(environment.element.listeners).toHaveLength(0);
  });
});
