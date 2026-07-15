import { FrameByFrameError } from '../core/errors.js';

import { assertEasingDefinition, resolveEasing } from './easing.js';

import type { EasingFunction, ScrollUnit, TimelineOptions } from '../types.js';

export interface NormalizedSegment {
  readonly sourceIndex: number;
  readonly scrollStart: number;
  readonly scrollEnd: number;
  readonly mediaStart: number;
  readonly mediaEnd: number;
  readonly clipId: string | null;
  readonly easing: EasingFunction;
}

export interface NormalizedTimeline {
  readonly unit: ScrollUnit;
  readonly segments: readonly NormalizedSegment[];
  readonly frameRate: number | null;
}

interface RuntimeSegment {
  readonly scroll?: unknown;
  readonly media?: unknown;
  readonly scrollUnit?: unknown;
  readonly clip?: unknown;
  readonly easing?: unknown;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const invalidTimeline = (message: string, details: Readonly<Record<string, unknown>>): never => {
  throw new FrameByFrameError('INVALID_TIMELINE', message, { details });
};

const invalidSegment = (
  index: number,
  message: string,
  details: Readonly<Record<string, unknown>>,
): never => {
  throw new FrameByFrameError('INVALID_SEGMENT', message, {
    details: {
      ...details,
      segmentIndex: index,
    },
  });
};

const readSegment = (value: unknown, segmentIndex: number): RuntimeSegment => {
  if (!isRecord(value)) {
    return invalidSegment(segmentIndex, 'Each timeline segment must be an object.', {
      segment: value,
    });
  }

  return value;
};

const readTuple = (
  value: unknown,
  field: 'scroll' | 'media',
  segmentIndex: number,
): readonly [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) {
    return invalidSegment(segmentIndex, `Segment ${field} must contain exactly two numbers.`, {
      field,
      value,
    });
  }

  const tuple = value as readonly unknown[];
  const start = tuple[0];
  const end = tuple[1];

  if (typeof start !== 'number' || !Number.isFinite(start)) {
    return invalidSegment(segmentIndex, `Segment ${field} start must be finite.`, {
      field,
      value: start,
    });
  }

  if (typeof end !== 'number' || !Number.isFinite(end)) {
    return invalidSegment(segmentIndex, `Segment ${field} end must be finite.`, {
      field,
      value: end,
    });
  }

  return [start, end];
};

const readUnit = (value: unknown, segmentIndex: number): ScrollUnit => {
  if (value === undefined) {
    return 'px';
  }

  if (value !== 'px' && value !== 'progress') {
    return invalidSegment(segmentIndex, 'Segment scrollUnit must be "px" or "progress".', {
      scrollUnit: value,
    });
  }

  return value;
};

const readClipId = (value: unknown, segmentIndex: number): string | null => {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalidSegment(segmentIndex, 'Segment clip must be a non-empty string.', {
      clip: value,
    });
  }

  return value;
};

const readFrameRate = (value: unknown): number | null => {
  if (value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    throw new FrameByFrameError('INVALID_FRAME_RATE', 'Frame configuration must be an object.', {
      details: { frame: value },
    });
  }

  if (value['snap'] === undefined || value['snap'] === false) {
    if (value['fps'] !== undefined) {
      throw new FrameByFrameError(
        'INVALID_FRAME_RATE',
        'Frame rate may only be provided when frame snapping is enabled.',
        { details: { frame: value } },
      );
    }

    return null;
  }

  if (
    value['snap'] !== true ||
    typeof value['fps'] !== 'number' ||
    !Number.isFinite(value['fps'])
  ) {
    throw new FrameByFrameError(
      'INVALID_FRAME_RATE',
      'Frame snapping requires a finite, positive fps value.',
      { details: { frame: value } },
    );
  }

  if (value['fps'] <= 0) {
    throw new FrameByFrameError(
      'INVALID_FRAME_RATE',
      'Frame snapping requires a finite, positive fps value.',
      { details: { frame: value } },
    );
  }

  return value['fps'];
};

export const normalizeTimeline = (options: TimelineOptions): NormalizedTimeline => {
  if (!isRecord(options)) {
    return invalidTimeline('Timeline options must be an object.', { options });
  }

  const segmentsValue: unknown = options.segments;

  if (!Array.isArray(segmentsValue) || segmentsValue.length === 0) {
    return invalidTimeline('A timeline requires at least one segment.', {
      segments: segmentsValue,
    });
  }

  assertEasingDefinition(options.easing, null);

  const defaultEasing = options.easing;
  let timelineUnit: ScrollUnit | undefined;
  const normalizedSegments: NormalizedSegment[] = [];
  const segmentValues = segmentsValue as readonly unknown[];

  for (const [sourceIndex, segmentValue] of segmentValues.entries()) {
    const segment = readSegment(segmentValue, sourceIndex);
    const scroll = readTuple(segment.scroll, 'scroll', sourceIndex);
    const media = readTuple(segment.media, 'media', sourceIndex);
    const unit = readUnit(segment.scrollUnit, sourceIndex);

    if (timelineUnit === undefined) {
      timelineUnit = unit;
    } else if (timelineUnit !== unit) {
      return invalidTimeline('All segments in a timeline must use the same scroll unit.', {
        expectedUnit: timelineUnit,
        receivedUnit: unit,
        segmentIndex: sourceIndex,
      });
    }

    if (scroll[1] <= scroll[0]) {
      invalidSegment(sourceIndex, 'Segment scroll intervals must be strictly increasing.', {
        scroll,
      });
    }

    if (unit === 'progress' && (scroll[0] < 0 || scroll[1] > 1)) {
      invalidSegment(sourceIndex, 'Progress segment boundaries must stay between 0 and 1.', {
        scroll,
      });
    }

    if (media[0] < 0 || media[1] < 0) {
      invalidSegment(sourceIndex, 'Segment media times cannot be negative.', { media });
    }

    const segmentEasing: unknown = segment.easing;
    assertEasingDefinition(segmentEasing, sourceIndex);

    const easingDefinition = segmentEasing ?? defaultEasing;

    normalizedSegments.push({
      sourceIndex,
      scrollStart: scroll[0],
      scrollEnd: scroll[1],
      mediaStart: media[0],
      mediaEnd: media[1],
      clipId: readClipId(segment.clip, sourceIndex),
      easing: resolveEasing(easingDefinition, sourceIndex),
    });
  }

  normalizedSegments.sort(
    (left, right): number =>
      left.scrollStart - right.scrollStart ||
      left.scrollEnd - right.scrollEnd ||
      left.sourceIndex - right.sourceIndex,
  );

  for (let index = 1; index < normalizedSegments.length; index += 1) {
    const previous = normalizedSegments[index - 1];
    const current = normalizedSegments[index];

    if (
      previous !== undefined &&
      current !== undefined &&
      current.scrollStart < previous.scrollEnd
    ) {
      throw new FrameByFrameError(
        'OVERLAPPING_SEGMENTS',
        `Segments at indexes ${String(previous.sourceIndex)} and ${String(current.sourceIndex)} overlap.`,
        {
          details: {
            currentSegmentIndex: current.sourceIndex,
            previousSegmentIndex: previous.sourceIndex,
          },
        },
      );
    }
  }

  return {
    unit: timelineUnit ?? 'px',
    segments: normalizedSegments,
    frameRate: readFrameRate(options.frame),
  };
};
