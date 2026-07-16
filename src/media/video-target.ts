import { FrameByFrameError } from '../core/errors.js';

import type { ControllerBindingConfig } from '../core/controller-config.js';

/** A claimed video target and its package ownership metadata. */
export interface ResolvedVideoTarget {
  readonly target: HTMLVideoElement;
  readonly owned: boolean;
  release(): void;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

export const isMediaDocument = (value: unknown): value is Document =>
  isRecord(value) &&
  value['nodeType'] === 9 &&
  typeof value['querySelector'] === 'function' &&
  typeof value['createElement'] === 'function';

export const isMediaHtmlElement = (value: unknown): value is HTMLElement =>
  isRecord(value) &&
  value['nodeType'] === 1 &&
  typeof value['appendChild'] === 'function' &&
  isMediaDocument(value['ownerDocument']);

const getElementName = (value: Readonly<Record<string, unknown>>): string => {
  const localName = value['localName'];

  if (typeof localName === 'string') {
    return localName.toLowerCase();
  }

  const tagName = value['tagName'];
  return typeof tagName === 'string' ? tagName.toLowerCase() : '';
};

export const isMediaVideoElement = (value: unknown): value is HTMLVideoElement =>
  isRecord(value) &&
  value['nodeType'] === 1 &&
  getElementName(value) === 'video' &&
  typeof value['addEventListener'] === 'function' &&
  typeof value['removeEventListener'] === 'function' &&
  typeof value['canPlayType'] === 'function' &&
  typeof value['load'] === 'function' &&
  typeof value['pause'] === 'function' &&
  typeof value['getAttribute'] === 'function' &&
  typeof value['setAttribute'] === 'function' &&
  typeof value['removeAttribute'] === 'function' &&
  typeof value['currentTime'] === 'number';

const getGlobalDocument = (): Document | null => {
  const candidate: unknown = (globalThis as { readonly document?: unknown }).document;
  return isMediaDocument(candidate) ? candidate : null;
};

const targetError = (
  code: 'TARGET_NOT_FOUND' | 'INVALID_TARGET_TYPE',
  bindingId: string,
  message: string,
  cause: unknown,
): never => {
  throw new FrameByFrameError(code, message, {
    cause,
    details: { bindingId },
  });
};

export const resolveMediaReference = (
  reference: unknown,
  bindingId: string,
  label: string,
): unknown => {
  let candidate = reference;

  if (typeof candidate === 'function') {
    try {
      candidate = (candidate as () => unknown)();
    } catch (cause) {
      return targetError(
        'TARGET_NOT_FOUND',
        bindingId,
        `The ${label} resolver threw an error.`,
        cause,
      );
    }
  }

  if (typeof candidate === 'string') {
    const document = getGlobalDocument();

    if (document === null) {
      throw new FrameByFrameError(
        'ENVIRONMENT_UNAVAILABLE',
        `A browser document is required to resolve the ${label} selector.`,
        { details: { bindingId } },
      );
    }

    try {
      candidate = document.querySelector(candidate);
    } catch (cause) {
      return targetError('TARGET_NOT_FOUND', bindingId, `The ${label} selector is invalid.`, cause);
    }
  }

  if (candidate === null || candidate === undefined) {
    return targetError(
      'TARGET_NOT_FOUND',
      bindingId,
      `The ${label} could not be resolved.`,
      candidate,
    );
  }

  return candidate;
};

/** Prevents more than one mounted binding from writing to the same target. */
export class VideoTargetRegistry {
  readonly #owners = new WeakMap<object, object>();

  acquire(target: HTMLVideoElement, owner: object, bindingId: string): () => void {
    if (this.#owners.has(target)) {
      throw new FrameByFrameError(
        'TARGET_CONFLICT',
        'The video target is already controlled by another mounted binding.',
        { details: { bindingId } },
      );
    }

    this.#owners.set(target, owner);
    let active = true;

    return (): void => {
      if (!active) {
        return;
      }

      active = false;

      if (this.#owners.get(target) === owner) {
        this.#owners.delete(target);
      }
    };
  }
}

const createOwnedTarget = (mountTo: HTMLElement, bindingId: string): HTMLVideoElement => {
  const document: unknown = mountTo.ownerDocument;

  if (!isMediaDocument(document)) {
    throw new FrameByFrameError(
      'ENVIRONMENT_UNAVAILABLE',
      'The mount container does not expose an owner document.',
      { details: { bindingId } },
    );
  }

  const target: unknown = document.createElement('video');

  if (!isMediaVideoElement(target)) {
    return targetError(
      'INVALID_TARGET_TYPE',
      bindingId,
      'The owner document could not create an HTMLVideoElement.',
      target,
    );
  }

  mountTo.appendChild(target);
  return target;
};

/** Resolves, creates, and globally claims one binding's native video target. */
export const resolveVideoTarget = (
  config: ControllerBindingConfig,
  registry: VideoTargetRegistry,
): ResolvedVideoTarget => {
  const owner = {};
  let target: HTMLVideoElement;
  let owned = false;

  if (config.target !== undefined) {
    const candidate = resolveMediaReference(config.target, config.id, 'video target');

    if (!isMediaVideoElement(candidate)) {
      return targetError(
        'INVALID_TARGET_TYPE',
        config.id,
        'The resolved target must be an HTMLVideoElement.',
        candidate,
      );
    }

    target = candidate;
  } else {
    const candidate = resolveMediaReference(config.mountTo, config.id, 'video mount container');

    if (!isMediaHtmlElement(candidate)) {
      return targetError(
        'INVALID_TARGET_TYPE',
        config.id,
        'The resolved mountTo value must be an HTMLElement.',
        candidate,
      );
    }

    target = createOwnedTarget(candidate, config.id);
    owned = true;
  }

  let releaseOwnership: (() => void) | null = null;

  try {
    releaseOwnership = registry.acquire(target, owner, config.id);
  } catch (error) {
    if (owned) {
      target.parentNode?.removeChild(target);
    }

    throw error;
  }

  let active = true;

  return {
    target,
    owned,
    release: (): void => {
      if (!active) {
        return;
      }

      active = false;
      releaseOwnership();

      if (owned) {
        target.parentNode?.removeChild(target);
      }
    },
  };
};
