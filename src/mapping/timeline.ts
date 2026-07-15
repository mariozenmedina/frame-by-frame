import { FrameByFrameError } from '../core/errors.js';

import { normalizeTimeline } from './normalize-timeline.js';

import type { NormalizedSegment, NormalizedTimeline } from './normalize-timeline.js';
import type { Timeline, TimelineOptions, TimelineResolution } from '../types.js';

const clampProgress = (progress: number): number => Math.min(1, Math.max(0, progress));

const snapTime = (time: number, frameRate: number | null): number =>
  frameRate === null ? time : Math.round(time * frameRate) / frameRate;

const createHeldResolution = (
  phase: 'before' | 'gap' | 'after',
  segment: NormalizedSegment,
  requestedTime: number,
  frameRate: number | null,
): TimelineResolution => ({
  phase,
  segmentIndex: null,
  clipId: segment.clipId,
  rawProgress: null,
  easedProgress: null,
  requestedTime,
  targetTime: snapTime(requestedTime, frameRate),
});

const createActiveResolution = (
  segment: NormalizedSegment,
  position: number,
  frameRate: number | null,
): TimelineResolution => {
  const rawProgress = clampProgress(
    (position - segment.scrollStart) / (segment.scrollEnd - segment.scrollStart),
  );
  const easedProgress = segment.easing(rawProgress);
  const requestedTime =
    segment.mediaStart + easedProgress * (segment.mediaEnd - segment.mediaStart);

  return {
    phase: 'active',
    segmentIndex: segment.sourceIndex,
    clipId: segment.clipId,
    rawProgress,
    easedProgress,
    requestedTime,
    targetTime: snapTime(requestedTime, frameRate),
  };
};

const findLastStartedSegment = (
  segments: readonly NormalizedSegment[],
  position: number,
): number => {
  let lower = 0;
  let upper = segments.length;

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const segment = segments[middle];

    if (segment !== undefined && segment.scrollStart <= position) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  return lower - 1;
};

const resolveTimeline = (timeline: NormalizedTimeline, position: number): TimelineResolution => {
  if (!Number.isFinite(position)) {
    throw new FrameByFrameError('INVALID_TIMELINE', 'Timeline position must be finite.', {
      details: { position },
    });
  }

  const first = timeline.segments[0];
  const last = timeline.segments[timeline.segments.length - 1];

  if (first === undefined || last === undefined) {
    throw new FrameByFrameError('INVALID_TIMELINE', 'A timeline requires at least one segment.');
  }

  if (position < first.scrollStart) {
    return createHeldResolution('before', first, first.mediaStart, timeline.frameRate);
  }

  if (position > last.scrollEnd) {
    return createHeldResolution('after', last, last.mediaEnd, timeline.frameRate);
  }

  const candidateIndex = findLastStartedSegment(timeline.segments, position);
  const candidate = timeline.segments[candidateIndex];

  if (candidate === undefined) {
    return createHeldResolution('before', first, first.mediaStart, timeline.frameRate);
  }

  if (position <= candidate.scrollEnd) {
    return createActiveResolution(candidate, position, timeline.frameRate);
  }

  return createHeldResolution('gap', candidate, candidate.mediaEnd, timeline.frameRate);
};

/** Creates an immutable, DOM-independent scroll-to-media timeline. */
export const createTimeline = (options: TimelineOptions): Timeline => {
  const normalized = normalizeTimeline(options);

  return Object.freeze({
    unit: normalized.unit,
    resolve: (position: number): TimelineResolution => resolveTimeline(normalized, position),
  });
};
