import { FrameByFrameError } from '../core/errors.js';

import type { Easing, EasingFunction } from '../types.js';

const clampProgress = (progress: number): number => Math.min(1, Math.max(0, progress));

const sampleBezier = (parameter: number, firstControl: number, secondControl: number): number => {
  const inverse = 1 - parameter;

  return (
    3 * inverse * inverse * parameter * firstControl +
    3 * inverse * parameter * parameter * secondControl +
    parameter * parameter * parameter
  );
};

const createCubicBezier = (x1: number, y1: number, x2: number, y2: number): EasingFunction => {
  return (progress: number): number => {
    const x = clampProgress(progress);

    if (x === 0 || x === 1) {
      return x;
    }

    let lower = 0;
    let upper = 1;
    let parameter = x;

    for (let iteration = 0; iteration < 24; iteration += 1) {
      const sampledX = sampleBezier(parameter, x1, x2);

      if (Math.abs(sampledX - x) <= 1e-7) {
        break;
      }

      if (sampledX < x) {
        lower = parameter;
      } else {
        upper = parameter;
      }

      parameter = (lower + upper) / 2;
    }

    return clampProgress(sampleBezier(parameter, y1, y2));
  };
};

const namedEasing = {
  linear: (progress: number): number => progress,
  'ease-in': createCubicBezier(0.42, 0, 1, 1),
  'ease-out': createCubicBezier(0, 0, 0.58, 1),
  'ease-in-out': createCubicBezier(0.42, 0, 0.58, 1),
} satisfies Readonly<Record<string, EasingFunction>>;

const invalidEasingDefinition = (easing: unknown, segmentIndex: number | null): never => {
  const scope = segmentIndex === null ? 'timeline' : `segment at index ${String(segmentIndex)}`;

  throw new FrameByFrameError(
    segmentIndex === null ? 'INVALID_TIMELINE' : 'INVALID_SEGMENT',
    `The ${scope} has an unsupported easing definition.`,
    {
      details: {
        easing,
        segmentIndex,
      },
    },
  );
};

export function assertEasingDefinition(
  easing: unknown,
  segmentIndex: number | null,
): asserts easing is Easing | undefined {
  if (easing === undefined || typeof easing === 'function') {
    return;
  }

  if (typeof easing !== 'string' || !Object.hasOwn(namedEasing, easing)) {
    invalidEasingDefinition(easing, segmentIndex);
  }
}

export const resolveEasing = (easing: Easing | undefined, segmentIndex: number): EasingFunction => {
  if (easing === undefined) {
    return namedEasing.linear;
  }

  if (typeof easing === 'string') {
    return namedEasing[easing];
  }

  return (progress: number): number => {
    let result: number;

    try {
      result = easing(clampProgress(progress));
    } catch (cause) {
      throw new FrameByFrameError(
        'INVALID_EASING_RESULT',
        `The custom easing for segment at index ${String(segmentIndex)} threw an error.`,
        {
          cause,
          details: {
            progress,
            segmentIndex,
          },
        },
      );
    }

    if (!Number.isFinite(result)) {
      throw new FrameByFrameError(
        'INVALID_EASING_RESULT',
        `The custom easing for segment at index ${String(segmentIndex)} returned a non-finite value.`,
        {
          details: {
            progress,
            result,
            segmentIndex,
          },
        },
      );
    }

    return clampProgress(result);
  };
};
