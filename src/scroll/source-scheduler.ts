import type { AxisName } from '../types.js';
import type { ResolvedScrollSource } from './source.js';

/** Scroll metrics read once and shared with every controller on a source. */
export interface ScrollAxisSnapshot {
  readonly offset: number;
  readonly max: number;
  readonly progress: number;
}

/** Horizontal and vertical metrics captured in one scheduler pass. */
export type ScrollSourceSnapshot = Readonly<Record<AxisName, ScrollAxisSnapshot>>;

export type ScrollSourceSubscriber = (snapshot: ScrollSourceSnapshot) => void;
export type AsyncErrorReporter = (error: unknown) => void;

const clampProgress = (value: number): number => Math.min(1, Math.max(0, value));

const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);

const createAxisSnapshot = (offset: number, max: number): ScrollAxisSnapshot => ({
  offset,
  max,
  progress: max === 0 ? 0 : clampProgress(offset / max),
});

/** One passive listener and at most one pending animation frame per scroll source. */
export class SourceScheduler {
  readonly #source: ResolvedScrollSource;
  readonly #reportAsyncError: AsyncErrorReporter;
  readonly #subscribers = new Set<ScrollSourceSubscriber>();
  readonly #handleScroll = (): void => {
    this.#schedule();
  };
  readonly #handleFrame = (): void => {
    this.#frameHandle = null;
    const snapshot = this.getSnapshot();

    for (const subscriber of [...this.#subscribers]) {
      try {
        subscriber(snapshot);
      } catch (error) {
        this.#reportAsyncError(error);
      }
    }
  };

  #frameHandle: number | null = null;
  #xMax = 0;
  #yMax = 0;

  constructor(source: ResolvedScrollSource, reportAsyncError: AsyncErrorReporter) {
    this.#source = source;
    this.#reportAsyncError = reportAsyncError;
  }

  subscribe(subscriber: ScrollSourceSubscriber): () => void {
    const shouldAttach = this.#subscribers.size === 0;
    this.#subscribers.add(subscriber);

    if (shouldAttach) {
      try {
        this.#source.eventTarget.addEventListener('scroll', this.#handleScroll, { passive: true });
      } catch (error) {
        this.#subscribers.delete(subscriber);
        throw error;
      }
    }

    let active = true;

    return (): void => {
      if (!active) {
        return;
      }

      active = false;
      this.#subscribers.delete(subscriber);

      if (this.#subscribers.size === 0) {
        this.#source.eventTarget.removeEventListener('scroll', this.#handleScroll);

        if (this.#frameHandle !== null) {
          this.#source.cancelFrame(this.#frameHandle);
          this.#frameHandle = null;
        }
      }
    };
  }

  refresh(): ScrollSourceSnapshot {
    const metrics = this.#source.metricsTarget;
    this.#xMax = Math.max(0, finiteOrZero(metrics.scrollWidth) - finiteOrZero(metrics.clientWidth));
    this.#yMax = Math.max(
      0,
      finiteOrZero(metrics.scrollHeight) - finiteOrZero(metrics.clientHeight),
    );
    return this.getSnapshot();
  }

  getSnapshot(): ScrollSourceSnapshot {
    const metrics = this.#source.metricsTarget;
    const x = createAxisSnapshot(finiteOrZero(metrics.scrollLeft), this.#xMax);
    const y = createAxisSnapshot(finiteOrZero(metrics.scrollTop), this.#yMax);

    return Object.freeze({
      x: Object.freeze(x),
      y: Object.freeze(y),
    });
  }

  #schedule(): void {
    if (this.#frameHandle === null && this.#subscribers.size > 0) {
      this.#frameHandle = this.#source.requestFrame(this.#handleFrame);
    }
  }
}

/** Weakly keys the shared scheduler used by every controller on one source. */
export class SourceRegistry {
  readonly #schedulers = new WeakMap<object, SourceScheduler>();
  readonly #reportAsyncError: AsyncErrorReporter;

  constructor(reportAsyncError: AsyncErrorReporter) {
    this.#reportAsyncError = reportAsyncError;
  }

  get(source: ResolvedScrollSource): SourceScheduler {
    const existing = this.#schedulers.get(source.key);

    if (existing !== undefined) {
      return existing;
    }

    const scheduler = new SourceScheduler(source, this.#reportAsyncError);
    this.#schedulers.set(source.key, scheduler);
    return scheduler;
  }
}
