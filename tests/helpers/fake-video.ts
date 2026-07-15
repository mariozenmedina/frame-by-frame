type Listener = EventListenerOrEventListenerObject;

export class FakeVideoElement {
  readonly nodeType = 1;
  readonly localName = 'video';
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<Listener>>();
  readonly seekAssignments: number[] = [];
  readonly frameCallbacks = new Map<number, (now: number, metadata: object) => void>();
  readonly cancelledFrameCallbacks: number[] = [];
  parentNode: { removeChild(child: unknown): unknown } | null = null;
  srcObject: unknown = null;
  muted = false;
  defaultMuted = false;
  playsInline = false;
  controls = false;
  loop = false;
  autoplay = false;
  preload = '';
  poster = '';
  crossOrigin: string | null = null;
  duration = Number.NaN;
  error: { readonly code: number } | null = null;
  loadCalls = 0;
  pauseCalls = 0;
  canPlay = 'probably';
  throwOnLoad: Error | null = null;
  throwOnSeek: Error | null = null;
  requestVideoFrameCallback?: (callback: (now: number, metadata: object) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
  #currentTime = 0;
  #nextFrameHandle = 1;

  get currentTime(): number {
    return this.#currentTime;
  }

  set currentTime(value: number) {
    if (this.throwOnSeek !== null) {
      throw this.throwOnSeek;
    }

    this.#currentTime = value;
    this.seekAssignments.push(value);
  }

  addEventListener(type: string, listener: Listener | null): void {
    if (listener === null) {
      return;
    }

    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener | null): void {
    if (listener !== null) {
      this.listeners.get(type)?.delete(listener);
    }
  }

  emit(type: string): void {
    const event = { type } as Event;

    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (typeof listener === 'function') {
        listener.call(this as unknown as EventTarget, event);
      } else {
        listener.handleEvent(event);
      }
    }
  }

  canPlayType(type: string): CanPlayTypeResult {
    return type.includes('unsupported') ? '' : (this.canPlay as CanPlayTypeResult);
  }

  load(): void {
    this.loadCalls += 1;

    if (this.throwOnLoad !== null) {
      throw this.throwOnLoad;
    }
  }

  pause(): void {
    this.pauseCalls += 1;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  enableFrameCallbacks(): void {
    this.requestVideoFrameCallback = (callback): number => {
      const handle = this.#nextFrameHandle++;
      this.frameCallbacks.set(handle, callback);
      return handle;
    };
    this.cancelVideoFrameCallback = (handle): void => {
      this.cancelledFrameCallbacks.push(handle);
      this.frameCallbacks.delete(handle);
    };
  }

  presentFrame(metadata: object, now = 0): void {
    const callbacks = [...this.frameCallbacks.values()];
    this.frameCallbacks.clear();

    for (const callback of callbacks) {
      callback(now, metadata);
    }
  }

  asVideo(): HTMLVideoElement {
    return this as unknown as HTMLVideoElement;
  }
}

export class FakeMediaDocument {
  readonly nodeType = 9;
  readonly selections = new Map<string, unknown>();
  readonly created: FakeVideoElement[] = [];
  selectorError: Error | null = null;

  querySelector(selector: string): Element | null {
    if (this.selectorError !== null) {
      throw this.selectorError;
    }

    return (this.selections.get(selector) ?? null) as Element | null;
  }

  createElement(name: string): HTMLElement {
    if (name !== 'video') {
      throw new Error(`Unexpected element: ${name}`);
    }

    const target = new FakeVideoElement();
    this.created.push(target);
    return target as unknown as HTMLElement;
  }
}

export class FakeMediaContainer {
  readonly nodeType = 1;
  readonly children: FakeVideoElement[] = [];
  readonly ownerDocument: FakeMediaDocument;

  constructor(document: FakeMediaDocument) {
    this.ownerDocument = document;
  }

  appendChild(child: Node): Node {
    const video = child as unknown as FakeVideoElement;
    this.children.push(video);
    video.parentNode = this;
    return child;
  }

  removeChild(child: unknown): unknown {
    const index = this.children.indexOf(child as FakeVideoElement);

    if (index >= 0) {
      this.children.splice(index, 1);
      (child as FakeVideoElement).parentNode = null;
    }

    return child;
  }

  asElement(): HTMLElement {
    return this as unknown as HTMLElement;
  }
}

export const installDocument = (document: FakeMediaDocument): (() => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });

  return (): void => {
    if (descriptor === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, 'document', descriptor);
    }
  };
};
