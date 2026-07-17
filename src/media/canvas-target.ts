import { FrameByFrameError } from '../core/errors.js';
import {
  isMediaDocument,
  isMediaHtmlElement,
  isMediaVideoElement,
  resolveMediaReference,
} from './video-target.js';

import type { ControllerBindingConfig } from '../core/controller-config.js';
import type { ResolvedVideoTarget, VideoTargetRegistry } from './video-target.js';

/** A claimed visible canvas and its package ownership metadata. */
export interface ResolvedCanvasTarget {
  readonly target: HTMLCanvasElement;
  readonly owned: boolean;
  release(): void;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const getElementName = (value: Readonly<Record<string, unknown>>): string => {
  const localName = value['localName'];

  if (typeof localName === 'string') {
    return localName.toLowerCase();
  }

  const tagName = value['tagName'];
  return typeof tagName === 'string' ? tagName.toLowerCase() : '';
};

const isCanvasElement = (value: unknown): value is HTMLCanvasElement =>
  isRecord(value) &&
  value['nodeType'] === 1 &&
  getElementName(value) === 'canvas' &&
  typeof value['getContext'] === 'function' &&
  isMediaDocument(value['ownerDocument']);

const targetError = (bindingId: string, message: string, cause: unknown): never => {
  throw new FrameByFrameError('INVALID_TARGET_TYPE', message, {
    cause,
    details: { bindingId },
  });
};

/** Prevents more than one mounted binding from drawing to the same canvas. */
export class CanvasTargetRegistry {
  readonly #owners = new WeakMap<object, object>();

  acquire(target: HTMLCanvasElement, owner: object, bindingId: string): () => void {
    if (this.#owners.has(target)) {
      throw new FrameByFrameError(
        'TARGET_CONFLICT',
        'The canvas target is already controlled by another mounted binding.',
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

const createOwnedCanvas = (mountTo: HTMLElement, bindingId: string): HTMLCanvasElement => {
  const document: unknown = mountTo.ownerDocument;

  if (!isMediaDocument(document)) {
    throw new FrameByFrameError(
      'ENVIRONMENT_UNAVAILABLE',
      'The canvas mount container does not expose an owner document.',
      { details: { bindingId } },
    );
  }

  const target: unknown = document.createElement('canvas');

  if (!isCanvasElement(target)) {
    return targetError(
      bindingId,
      'The owner document could not create an HTMLCanvasElement.',
      target,
    );
  }

  mountTo.appendChild(target);
  return target;
};

/** Resolves, creates, and globally claims one binding's visible canvas. */
export const resolveCanvasTarget = (
  config: ControllerBindingConfig,
  registry: CanvasTargetRegistry,
): ResolvedCanvasTarget => {
  const owner = {};
  let target: HTMLCanvasElement;
  let owned = false;

  if (config.target !== undefined) {
    const candidate = resolveMediaReference(config.target, config.id, 'canvas target');

    if (!isCanvasElement(candidate)) {
      return targetError(config.id, 'The resolved target must be an HTMLCanvasElement.', candidate);
    }

    target = candidate;
  } else {
    const candidate = resolveMediaReference(config.mountTo, config.id, 'canvas mount container');

    if (!isMediaHtmlElement(candidate)) {
      return targetError(
        config.id,
        'The resolved mountTo value must be an HTMLElement.',
        candidate,
      );
    }

    target = createOwnedCanvas(candidate, config.id);
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

/** Resolves or creates the video decoder used behind one visible canvas. */
export const resolveCanvasDecoder = (
  config: ControllerBindingConfig,
  canvas: HTMLCanvasElement,
  registry: VideoTargetRegistry,
): ResolvedVideoTarget => {
  const canvasOptions = config.canvas;

  if (canvasOptions === null) {
    throw new FrameByFrameError('INVALID_MEDIA_CONFIG', 'Canvas renderer options are missing.', {
      details: { bindingId: config.id },
    });
  }

  const owner = {};
  const supplied = canvasOptions.decoderTarget !== undefined;
  let target: HTMLVideoElement;

  if (supplied) {
    const candidate = resolveMediaReference(
      canvasOptions.decoderTarget,
      config.id,
      'canvas decoder target',
    );

    if (!isMediaVideoElement(candidate)) {
      return targetError(
        config.id,
        'The resolved canvas decoderTarget must be an HTMLVideoElement.',
        candidate,
      );
    }

    target = candidate;
  } else {
    const document: unknown = canvas.ownerDocument;

    if (!isMediaDocument(document)) {
      throw new FrameByFrameError(
        'ENVIRONMENT_UNAVAILABLE',
        'The canvas target does not expose an owner document for its video decoder.',
        { details: { bindingId: config.id } },
      );
    }

    const candidate: unknown = document.createElement('video');

    if (!isMediaVideoElement(candidate)) {
      return targetError(
        config.id,
        'The canvas owner document could not create an HTMLVideoElement decoder.',
        candidate,
      );
    }

    target = candidate;
  }

  const releaseOwnership = registry.acquire(target, owner, config.id);
  let active = true;

  return {
    target,
    owned: !supplied,
    release: (): void => {
      if (!active) {
        return;
      }

      active = false;
      releaseOwnership();

      if (!supplied) {
        target.parentNode?.removeChild(target);
      }
    },
  };
};
