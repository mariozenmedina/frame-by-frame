import { FrameByFrameError } from '../core/errors.js';

import type { ControllerBreakpointConfig } from '../core/controller-config.js';
import type { ScrollSource } from '../types.js';

interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

interface ResizeObserverLike {
  observe(target: Element): void;
  disconnect(): void;
}

interface BrowserViewLike {
  matchMedia?: (query: string) => MediaQueryListLike;
  addEventListener?: (
    type: string,
    listener: () => void,
    options?: AddEventListenerOptions,
  ) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
  ResizeObserver?: new (callback: () => void) => ResizeObserverLike;
}

/** Current browser preferences observed by one mounted controller. */
export interface ControllerEnvironmentSnapshot {
  readonly activeBreakpoints: readonly string[];
  readonly prefersReducedMotion: boolean;
  readonly hidden: boolean;
}

export interface ControllerEnvironmentObserver {
  getSnapshot(): ControllerEnvironmentSnapshot;
  observeTargets(targets: readonly Element[]): void;
  destroy(): void;
}

export interface ControllerEnvironmentObserverOptions {
  readonly source: ScrollSource;
  readonly breakpoints: readonly ControllerBreakpointConfig[];
  readonly requestFrame: (callback: FrameRequestCallback) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly onMediaChange: (snapshot: ControllerEnvironmentSnapshot) => void;
  readonly onResize: () => void;
  readonly onVisibilityChange: (hidden: boolean) => void;
}

export type ControllerEnvironmentObserverFactory = (
  options: ControllerEnvironmentObserverOptions,
) => ControllerEnvironmentObserver;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const getDocument = (source: ScrollSource): Document | null => {
  if (source.nodeType === 9) {
    return source as Document;
  }

  const ownerDocument = (source as HTMLElement).ownerDocument;
  return ownerDocument.nodeType === 9 ? ownerDocument : null;
};

const getView = (document: Document | null): BrowserViewLike | null => {
  const ownerView: unknown = document?.defaultView;

  if (isRecord(ownerView)) {
    return ownerView;
  }

  const globalWindow: unknown = (globalThis as { readonly window?: unknown }).window;
  return isRecord(globalWindow) ? globalWindow : null;
};

const freezeSnapshot = (
  activeBreakpoints: readonly string[],
  prefersReducedMotion: boolean,
  hidden: boolean,
): ControllerEnvironmentSnapshot =>
  Object.freeze({
    activeBreakpoints: Object.freeze([...activeBreakpoints]),
    prefersReducedMotion,
    hidden,
  });

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const listenToMediaQuery = (query: MediaQueryListLike, listener: () => void): (() => void) => {
  if (query.addEventListener !== undefined && query.removeEventListener !== undefined) {
    query.addEventListener('change', listener);
    return (): void => {
      query.removeEventListener?.('change', listener);
    };
  }

  if (query.addListener !== undefined && query.removeListener !== undefined) {
    query.addListener(listener);
    return (): void => {
      query.removeListener?.(listener);
    };
  }

  return (): void => undefined;
};

/** Mount-scoped browser observers with no import-time DOM access or timers. */
export const createControllerEnvironmentObserver: ControllerEnvironmentObserverFactory = (
  options,
) => {
  const document = getDocument(options.source);
  const view = getView(document);
  const mediaQueries = new Map<string, MediaQueryListLike>();
  const cleanups: (() => void)[] = [];
  let reducedMotionQuery: MediaQueryListLike | null = null;
  let resizeObserver: ResizeObserverLike | null = null;
  let resizeFrame: number | null = null;
  let mediaScheduled = false;
  let destroyed = false;

  const readHidden = (): boolean => document?.hidden === true;
  const readSnapshot = (): ControllerEnvironmentSnapshot =>
    freezeSnapshot(
      options.breakpoints
        .filter((breakpoint) => mediaQueries.get(breakpoint.id)?.matches === true)
        .map((breakpoint) => breakpoint.id),
      reducedMotionQuery?.matches === true,
      readHidden(),
    );
  let snapshot = freezeSnapshot([], false, readHidden());

  const publishMedia = (): void => {
    mediaScheduled = false;

    if (destroyed) {
      return;
    }

    const next = readSnapshot();

    if (
      next.prefersReducedMotion !== snapshot.prefersReducedMotion ||
      !arraysEqual(next.activeBreakpoints, snapshot.activeBreakpoints)
    ) {
      snapshot = next;
      options.onMediaChange(snapshot);
    }
  };
  const scheduleMedia = (): void => {
    if (!mediaScheduled) {
      mediaScheduled = true;
      globalThis.queueMicrotask(publishMedia);
    }
  };

  if (view?.matchMedia !== undefined) {
    for (const breakpoint of options.breakpoints) {
      let mediaQuery: MediaQueryListLike;

      try {
        mediaQuery = view.matchMedia(breakpoint.query);
      } catch (cause) {
        for (const cleanup of cleanups.splice(0)) {
          cleanup();
        }

        throw new FrameByFrameError(
          'INVALID_BREAKPOINT_CONFIG',
          `The media query for breakpoint "${breakpoint.id}" could not be evaluated.`,
          { cause, details: { breakpointId: breakpoint.id, query: breakpoint.query } },
        );
      }

      mediaQueries.set(breakpoint.id, mediaQuery);
      cleanups.push(listenToMediaQuery(mediaQuery, scheduleMedia));
    }

    try {
      reducedMotionQuery = view.matchMedia('(prefers-reduced-motion: reduce)');
    } catch (cause) {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }

      throw new FrameByFrameError(
        'ENVIRONMENT_UNAVAILABLE',
        'The reduced-motion media query could not be evaluated.',
        { cause },
      );
    }

    cleanups.push(listenToMediaQuery(reducedMotionQuery, scheduleMedia));
  }

  snapshot = readSnapshot();

  const scheduleResize = (): void => {
    if (resizeFrame === null && !snapshot.hidden && !destroyed) {
      resizeFrame = options.requestFrame((): void => {
        resizeFrame = null;
        options.onResize();
      });
    }
  };

  if (view?.addEventListener !== undefined && view.removeEventListener !== undefined) {
    view.addEventListener('resize', scheduleResize, { passive: true });
    cleanups.push((): void => {
      view.removeEventListener?.('resize', scheduleResize);
    });
  }

  if (document !== null) {
    const handleVisibility = (): void => {
      const hidden = readHidden();

      if (hidden === snapshot.hidden) {
        return;
      }

      snapshot = freezeSnapshot(snapshot.activeBreakpoints, snapshot.prefersReducedMotion, hidden);

      if (hidden && resizeFrame !== null) {
        options.cancelFrame(resizeFrame);
        resizeFrame = null;
      }

      options.onVisibilityChange(hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    cleanups.push((): void => {
      document.removeEventListener('visibilitychange', handleVisibility);
    });
  }

  const ResizeObserverConstructor = view?.ResizeObserver ?? globalThis.ResizeObserver;

  if (typeof ResizeObserverConstructor === 'function') {
    try {
      resizeObserver = new ResizeObserverConstructor(scheduleResize);
      const sourceTarget =
        options.source.nodeType === 9 ? document?.documentElement : options.source;

      if (sourceTarget !== undefined) {
        resizeObserver.observe(sourceTarget as Element);
      }
    } catch {
      resizeObserver?.disconnect();
      resizeObserver = null;
    }
  }

  return {
    getSnapshot: (): ControllerEnvironmentSnapshot => snapshot,
    observeTargets: (targets): void => {
      for (const target of targets) {
        resizeObserver?.observe(target);
      }
    },
    destroy: (): void => {
      if (destroyed) {
        return;
      }

      destroyed = true;

      if (resizeFrame !== null) {
        options.cancelFrame(resizeFrame);
        resizeFrame = null;
      }

      resizeObserver?.disconnect();
      resizeObserver = null;

      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    },
  };
};
