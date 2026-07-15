import type { AsyncErrorReporter } from '../scroll/source-scheduler.js';

/** Small typed emitter that isolates failures from individual listeners. */
export class EventEmitter<EventMap extends object> {
  readonly #listeners = new Map<keyof EventMap, Set<(payload: never) => void>>();
  readonly #reportAsyncError: AsyncErrorReporter;

  constructor(reportAsyncError: AsyncErrorReporter) {
    this.#reportAsyncError = reportAsyncError;
  }

  on<EventName extends keyof EventMap>(
    event: EventName,
    listener: (payload: EventMap[EventName]) => void,
  ): () => void {
    let listeners = this.#listeners.get(event);

    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(event, listeners);
    }

    const storedListener = listener as (payload: never) => void;
    listeners.add(storedListener);
    let active = true;

    return (): void => {
      if (!active) {
        return;
      }

      active = false;
      listeners.delete(storedListener);
    };
  }

  emit<EventName extends keyof EventMap>(event: EventName, payload: EventMap[EventName]): void {
    const listeners = this.#listeners.get(event);

    if (listeners === undefined) {
      return;
    }

    for (const listener of [...listeners]) {
      try {
        listener(payload as never);
      } catch (error) {
        this.#reportAsyncError(error);
      }
    }
  }

  clear(): void {
    this.#listeners.clear();
  }
}
