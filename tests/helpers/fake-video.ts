type Listener = EventListenerOrEventListenerObject;

export class FakeVideoElement {
  readonly nodeType = 1;
  readonly localName = 'video';
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<Listener>>();
  readonly seekAssignments: number[] = [];
  readonly frameCallbacks = new Map<number, (now: number, metadata: object) => void>();
  readonly cancelledFrameCallbacks: number[] = [];
  readonly ownerDocument = { baseURI: 'https://example.com/' };
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
  readyState = 4;
  videoWidth = 1920;
  videoHeight = 1080;
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

export class FakeCanvasContext {
  imageSmoothingEnabled = true;
  readonly clearCalls: number[][] = [];
  readonly drawCalls: unknown[][] = [];
  drawError: Error | null = null;

  clearRect(...values: number[]): void {
    this.clearCalls.push(values);
  }

  drawImage(...values: unknown[]): void {
    if (this.drawError !== null) {
      throw this.drawError;
    }

    this.drawCalls.push(values);
  }

  asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

export class FakeCanvasElement {
  readonly nodeType = 1;
  readonly localName = 'canvas';
  readonly ownerDocument: FakeMediaDocument;
  readonly context = new FakeCanvasContext();
  parentNode: { removeChild(child: unknown): unknown } | null = null;
  clientWidth = 300;
  clientHeight = 150;
  width = 300;
  height = 150;
  contextAvailable = true;

  constructor(document: FakeMediaDocument) {
    this.ownerDocument = document;
  }

  getContext(contextId: string): RenderingContext | null {
    return contextId === '2d' && this.contextAvailable ? this.context.asContext() : null;
  }

  asCanvas(): HTMLCanvasElement {
    return this as unknown as HTMLCanvasElement;
  }
}

export class FakeMediaDocument {
  readonly nodeType = 9;
  readonly selections = new Map<string, unknown>();
  readonly created: FakeVideoElement[] = [];
  readonly createdCanvases: FakeCanvasElement[] = [];
  readonly animationFrames = new Map<number, FrameRequestCallback>();
  readonly cancelledAnimationFrames: number[] = [];
  readonly defaultView = {
    devicePixelRatio: 2,
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      const handle = this.#nextAnimationFrameHandle++;
      this.animationFrames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle: number): void => {
      this.cancelledAnimationFrames.push(handle);
      this.animationFrames.delete(handle);
    },
  };
  selectorError: Error | null = null;
  #nextAnimationFrameHandle = 1;

  flushAnimationFrames(timestamp = 0): void {
    const callbacks = [...this.animationFrames.values()];
    this.animationFrames.clear();

    for (const callback of callbacks) {
      callback(timestamp);
    }
  }

  querySelector(selector: string): Element | null {
    if (this.selectorError !== null) {
      throw this.selectorError;
    }

    return (this.selections.get(selector) ?? null) as Element | null;
  }

  createElement(name: string): HTMLElement {
    if (name === 'canvas') {
      const target = new FakeCanvasElement(this);
      this.createdCanvases.push(target);
      return target as unknown as HTMLElement;
    }

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
  readonly children: (FakeVideoElement | FakeCanvasElement)[] = [];
  readonly ownerDocument: FakeMediaDocument;

  constructor(document: FakeMediaDocument) {
    this.ownerDocument = document;
  }

  appendChild(child: Node): Node {
    const element = child as unknown as FakeVideoElement | FakeCanvasElement;
    this.children.push(element);
    element.parentNode = this;
    return child;
  }

  removeChild(child: unknown): unknown {
    const index = this.children.indexOf(child as FakeVideoElement);

    if (index >= 0) {
      this.children.splice(index, 1);
      (child as FakeVideoElement | FakeCanvasElement).parentNode = null;
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
