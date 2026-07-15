import { FrameByFrameError } from '../core/errors.js';

import type { ScrollSource } from '../types.js';

interface ScrollMetricsTarget {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

interface AnimationFrameHost {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}

/** A canonical scroll source with the browser capabilities used by the scheduler. */
export interface ResolvedScrollSource {
  readonly key: object;
  readonly publicSource: ScrollSource;
  readonly eventTarget: EventTarget;
  readonly metricsTarget: ScrollMetricsTarget;
  readonly requestFrame: (callback: FrameRequestCallback) => number;
  readonly cancelFrame: (handle: number) => void;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const hasEventTargetMethods = (value: Readonly<Record<string, unknown>>): boolean =>
  typeof value['addEventListener'] === 'function' &&
  typeof value['removeEventListener'] === 'function';

const isDocument = (value: unknown): value is Document =>
  isRecord(value) &&
  value['nodeType'] === 9 &&
  hasEventTargetMethods(value) &&
  typeof value['querySelector'] === 'function' &&
  isRecord(value['documentElement']);

const isHtmlElement = (value: unknown): value is HTMLElement =>
  isRecord(value) &&
  value['nodeType'] === 1 &&
  hasEventTargetMethods(value) &&
  typeof value['scrollLeft'] === 'number' &&
  typeof value['scrollTop'] === 'number' &&
  typeof value['scrollWidth'] === 'number' &&
  typeof value['scrollHeight'] === 'number' &&
  typeof value['clientWidth'] === 'number' &&
  typeof value['clientHeight'] === 'number';

const isAnimationFrameHost = (value: unknown): value is AnimationFrameHost =>
  isRecord(value) &&
  typeof value['requestAnimationFrame'] === 'function' &&
  typeof value['cancelAnimationFrame'] === 'function';

const getGlobalDocument = (): Document | null => {
  const candidate: unknown = (globalThis as { readonly document?: unknown }).document;
  return isDocument(candidate) ? candidate : null;
};

const getGlobalWindow = (): unknown => (globalThis as { readonly window?: unknown }).window;

const environmentUnavailable = (message: string): never => {
  throw new FrameByFrameError('ENVIRONMENT_UNAVAILABLE', message);
};

const sourceNotFound = (message: string, cause: unknown): never => {
  throw new FrameByFrameError('SOURCE_NOT_FOUND', message, { cause });
};

const getDocumentMetricsTarget = (documentSource: Document): HTMLElement => {
  const metricsTarget = documentSource.scrollingElement ?? documentSource.documentElement;

  if (!isHtmlElement(metricsTarget)) {
    return sourceNotFound('The document does not expose a valid scrolling element.', metricsTarget);
  }

  return metricsTarget;
};

const getOwnerDocument = (source: Document | HTMLElement): Document | null => {
  if (isDocument(source)) {
    return source;
  }

  const ownerDocument: unknown = source.ownerDocument;
  return isDocument(ownerDocument) ? ownerDocument : null;
};

const resolveFrameHost = (source: Document | HTMLElement): AnimationFrameHost => {
  const ownerDocument = getOwnerDocument(source);
  const ownerWindow: unknown = ownerDocument?.defaultView;
  const frameHost = isAnimationFrameHost(ownerWindow) ? ownerWindow : getGlobalWindow();

  if (!isAnimationFrameHost(frameHost)) {
    return environmentUnavailable(
      'requestAnimationFrame and cancelAnimationFrame are required to mount a controller.',
    );
  }

  return frameHost;
};

const canonicalizeSource = (source: Document | HTMLElement): Document | HTMLElement => {
  if (isDocument(source)) {
    return source;
  }

  const ownerDocument = getOwnerDocument(source);

  if (
    ownerDocument !== null &&
    (source === ownerDocument.scrollingElement ||
      (ownerDocument.scrollingElement === null && source === ownerDocument.documentElement))
  ) {
    return ownerDocument;
  }

  return source;
};

const resolveReference = (reference: unknown): Document | HTMLElement => {
  let candidate = reference;

  if (typeof candidate === 'function') {
    try {
      candidate = (candidate as () => unknown)();
    } catch (cause) {
      return sourceNotFound('The scroll source resolver threw an error.', cause);
    }
  }

  if (candidate === undefined) {
    const globalDocument = getGlobalDocument();

    if (globalDocument === null) {
      return environmentUnavailable(
        'A browser document is required when no scroll source is provided.',
      );
    }

    return globalDocument;
  }

  if (typeof candidate === 'string') {
    const globalDocument = getGlobalDocument();

    if (globalDocument === null) {
      return environmentUnavailable('A browser document is required to resolve a selector.');
    }

    let selected: Element | null;

    try {
      selected = globalDocument.querySelector(candidate);
    } catch (cause) {
      return sourceNotFound(`The scroll source selector "${candidate}" is invalid.`, cause);
    }

    if (!isHtmlElement(selected)) {
      return sourceNotFound(
        `The scroll source selector "${candidate}" did not resolve to an HTMLElement.`,
        selected,
      );
    }

    return selected;
  }

  if (!isDocument(candidate) && !isHtmlElement(candidate)) {
    return sourceNotFound(
      'The scroll source must be a Document, HTMLElement, selector, or synchronous resolver.',
      candidate,
    );
  }

  return candidate;
};

/** Resolves and canonicalizes a configured source without accessing the DOM before mount. */
export const resolveScrollSource = (reference: unknown): ResolvedScrollSource => {
  const source = canonicalizeSource(resolveReference(reference));
  const frameHost = resolveFrameHost(source);
  const metricsTarget = isDocument(source) ? getDocumentMetricsTarget(source) : source;

  return {
    key: source,
    publicSource: source,
    eventTarget: source,
    metricsTarget,
    requestFrame: frameHost.requestAnimationFrame.bind(frameHost),
    cancelFrame: frameHost.cancelAnimationFrame.bind(frameHost),
  };
};
