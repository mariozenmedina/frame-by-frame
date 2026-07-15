import { resolveScrollSource } from '../../src/scroll/source.js';

import type { ResolvedScrollSource } from '../../src/scroll/source.js';

type Listener = EventListenerOrEventListenerObject;

export class FakeFrameHost {
  readonly callbacks = new Map<number, FrameRequestCallback>();
  readonly cancelled: number[] = [];
  #nextHandle = 1;

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const handle = this.#nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  flush(timestamp = 0): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();

    for (const callback of callbacks) {
      callback(timestamp);
    }
  }
}

export class FakeScrollElement {
  readonly nodeType = 1;
  readonly listenerOptions: unknown[] = [];
  readonly listeners = new Set<Listener>();
  ownerDocument: FakeDocument | null = null;
  scrollLeft = 0;
  scrollTop = 0;
  scrollWidth = 100;
  scrollHeight = 100;
  clientWidth = 100;
  clientHeight = 100;

  addEventListener(
    type: string,
    callback: Listener | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === 'scroll' && callback !== null) {
      this.listeners.add(callback);
      this.listenerOptions.push(options);
    }
  }

  removeEventListener(type: string, callback: Listener | null): void {
    if (type === 'scroll' && callback !== null) {
      this.listeners.delete(callback);
    }
  }

  emitScroll(): void {
    const event = { type: 'scroll' } as Event;

    for (const listener of [...this.listeners]) {
      if (typeof listener === 'function') {
        listener.call(this as unknown as EventTarget, event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

export class FakeDocument {
  readonly nodeType = 9;
  readonly listeners = new Set<Listener>();
  readonly selections = new Map<string, unknown>();
  readonly documentElement: FakeScrollElement;
  scrollingElement: FakeScrollElement | null;
  defaultView: FakeFrameHost | null;
  selectorError: Error | null = null;

  constructor(frameHost: FakeFrameHost, scrollingElement = new FakeScrollElement()) {
    this.defaultView = frameHost;
    this.documentElement = scrollingElement;
    this.scrollingElement = scrollingElement;
    scrollingElement.ownerDocument = this;
  }

  addEventListener(type: string, callback: Listener | null): void {
    if (type === 'scroll' && callback !== null) {
      this.listeners.add(callback);
    }
  }

  removeEventListener(type: string, callback: Listener | null): void {
    if (type === 'scroll' && callback !== null) {
      this.listeners.delete(callback);
    }
  }

  querySelector(selector: string): Element | null {
    if (this.selectorError !== null) {
      throw this.selectorError;
    }

    return (this.selections.get(selector) ?? null) as Element | null;
  }
}

export interface FakeScrollEnvironment {
  readonly document: FakeDocument;
  readonly element: FakeScrollElement;
  readonly frameHost: FakeFrameHost;
  readonly resolved: ResolvedScrollSource;
}

export const createFakeScrollEnvironment = (): FakeScrollEnvironment => {
  const frameHost = new FakeFrameHost();
  const element = new FakeScrollElement();
  const document = new FakeDocument(frameHost);
  element.ownerDocument = document;

  return {
    document,
    element,
    frameHost,
    resolved: resolveScrollSource(element),
  };
};

export const installFakeDocument = (document: FakeDocument): (() => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });

  return (): void => {
    if (descriptor === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, 'document', descriptor);
    }
  };
};
