import { describe, expect, it } from 'vitest';

import { createTimeline, FrameByFrameError } from '../src/index.js';

import type { FrameByFrameErrorCode, TimelineOptions, TimelineSegment } from '../src/types.js';

const captureFrameByFrameError = (
  action: () => unknown,
  code: FrameByFrameErrorCode,
): FrameByFrameError => {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(FrameByFrameError);
    expect(error).toMatchObject({ code, name: 'FrameByFrameError' });

    return error as FrameByFrameError;
  }

  throw new Error(`Expected FrameByFrameError with code ${code}.`);
};

describe('createTimeline', () => {
  it('maps a pixel position to media time with linear easing by default', () => {
    const timeline = createTimeline({
      segments: [
        {
          clip: 'intro',
          media: [10, 20],
          scroll: [0, 100],
        },
      ],
    });

    expect(timeline.unit).toBe('px');
    expect(timeline.resolve(50)).toEqual({
      phase: 'active',
      segmentIndex: 0,
      clipId: 'intro',
      rawProgress: 0.5,
      easedProgress: 0.5,
      requestedTime: 15,
      targetTime: 15,
    });
  });

  it('sorts without mutation and resolves reverse ranges, gaps, and outer clamping', () => {
    const later: TimelineSegment = {
      clip: 'detail',
      media: [8, 2],
      scroll: [20, 30],
    };
    const earlier: TimelineSegment = {
      clip: 'intro',
      media: [0, 5],
      scroll: [0, 10],
    };
    const segments = [later, earlier];
    const timeline = createTimeline({ segments });

    expect(segments).toEqual([later, earlier]);
    expect(timeline.resolve(-1)).toMatchObject({
      phase: 'before',
      clipId: 'intro',
      requestedTime: 0,
      segmentIndex: null,
    });
    expect(timeline.resolve(10)).toMatchObject({
      phase: 'active',
      clipId: 'intro',
      requestedTime: 5,
      segmentIndex: 1,
    });
    expect(timeline.resolve(15)).toMatchObject({
      phase: 'gap',
      clipId: 'intro',
      requestedTime: 5,
      segmentIndex: null,
    });
    expect(timeline.resolve(25)).toMatchObject({
      phase: 'active',
      clipId: 'detail',
      requestedTime: 5,
      segmentIndex: 0,
    });
    expect(timeline.resolve(31)).toMatchObject({
      phase: 'after',
      clipId: 'detail',
      requestedTime: 2,
      segmentIndex: null,
    });
  });

  it('selects the later clip at a shared segment boundary', () => {
    const timeline = createTimeline({
      segments: [
        { clip: 'video-1', media: [0, 5], scroll: [0, 10] },
        { clip: 'video-3', media: [40, 50], scroll: [10, 20] },
      ],
    });

    expect(timeline.resolve(10)).toMatchObject({
      phase: 'active',
      clipId: 'video-3',
      requestedTime: 40,
      segmentIndex: 1,
    });
  });

  it('supports normalized progress timelines', () => {
    const timeline = createTimeline({
      segments: [
        {
          media: [2, 10],
          scroll: [0.25, 0.75],
          scrollUnit: 'progress',
        },
      ],
    });

    expect(timeline.unit).toBe('progress');
    expect(timeline.resolve(0.5)).toMatchObject({
      rawProgress: 0.5,
      requestedTime: 6,
    });
  });

  it('allows negative pixel boundaries', () => {
    const timeline = createTimeline({
      segments: [{ media: [0, 4], scroll: [-10, 10] }],
    });

    expect(timeline.resolve(0).requestedTime).toBe(2);
  });

  it('uses CSS easing globally and lets a segment override it', () => {
    const timeline = createTimeline({
      easing: 'ease-in',
      segments: [
        { media: [0, 1], scroll: [0, 1] },
        { easing: 'linear', media: [0, 1], scroll: [1, 2] },
      ],
    });

    expect(timeline.resolve(0.5).easedProgress).toBeCloseTo(0.315357, 6);
    expect(timeline.resolve(1.5).easedProgress).toBe(0.5);
  });

  it('clamps finite custom easing results', () => {
    const high = createTimeline({
      easing: () => 2,
      segments: [{ media: [10, 20], scroll: [0, 1] }],
    });
    const low = createTimeline({
      easing: () => -1,
      segments: [{ media: [10, 20], scroll: [0, 1] }],
    });

    expect(high.resolve(0.5).requestedTime).toBe(20);
    expect(low.resolve(0.5).requestedTime).toBe(10);
  });

  it('wraps thrown and non-finite custom easing results', () => {
    const cause = new Error('custom failure');
    const throwing = createTimeline({
      easing: () => {
        throw cause;
      },
      segments: [{ media: [0, 1], scroll: [0, 1] }],
    });
    const nonFinite = createTimeline({
      easing: () => Number.NaN,
      segments: [{ media: [0, 1], scroll: [0, 1] }],
    });

    const thrownError = captureFrameByFrameError(
      () => throwing.resolve(0.5),
      'INVALID_EASING_RESULT',
    );
    const nonFiniteError = captureFrameByFrameError(
      () => nonFinite.resolve(0.5),
      'INVALID_EASING_RESULT',
    );

    expect(thrownError.cause).toBe(cause);
    expect(nonFiniteError.details).toMatchObject({ result: Number.NaN, segmentIndex: 0 });
  });

  it('rejects inherited object keys as easing names', () => {
    const options = {
      easing: 'toString',
      segments: [{ media: [0, 1], scroll: [0, 1] }],
    } as unknown as TimelineOptions;

    captureFrameByFrameError(() => createTimeline(options), 'INVALID_TIMELINE');
  });

  it('reports continuous and frame-snapped target times independently', () => {
    const timeline = createTimeline({
      frame: { fps: 24, snap: true },
      segments: [{ media: [0, 1], scroll: [0, 1] }],
    });

    expect(timeline.resolve(0.52)).toMatchObject({
      requestedTime: 0.52,
      targetTime: 0.5,
    });
  });

  it('captures caller-owned tuples and arrays at creation time', () => {
    const scroll: [number, number] = [0, 10];
    const media: [number, number] = [0, 10];
    const segments: TimelineSegment[] = [{ media, scroll }];
    const timeline = createTimeline({ segments });

    scroll[1] = 100;
    media[1] = 100;
    segments.push({ media: [100, 200], scroll: [100, 200] });

    expect(timeline.resolve(5).requestedTime).toBe(5);
    expect(timeline.resolve(50).phase).toBe('after');
  });

  it.each([
    ['empty timelines', () => createTimeline({ segments: [] }), 'INVALID_TIMELINE'],
    [
      'mixed units',
      () =>
        createTimeline({
          segments: [
            { media: [0, 1], scroll: [0, 1] },
            { media: [1, 2], scroll: [0, 1], scrollUnit: 'progress' },
          ],
        }),
      'INVALID_TIMELINE',
    ],
    [
      'zero-length scroll intervals',
      () => createTimeline({ segments: [{ media: [0, 1], scroll: [1, 1] }] }),
      'INVALID_SEGMENT',
    ],
    [
      'reverse scroll intervals',
      () => createTimeline({ segments: [{ media: [0, 1], scroll: [2, 1] }] }),
      'INVALID_SEGMENT',
    ],
    [
      'negative media times',
      () => createTimeline({ segments: [{ media: [-1, 1], scroll: [0, 1] }] }),
      'INVALID_SEGMENT',
    ],
    [
      'out-of-range progress',
      () =>
        createTimeline({
          segments: [{ media: [0, 1], scroll: [0, 2], scrollUnit: 'progress' }],
        }),
      'INVALID_SEGMENT',
    ],
    [
      'overlapping segments',
      () =>
        createTimeline({
          segments: [
            { media: [0, 1], scroll: [0, 2] },
            { media: [1, 2], scroll: [1, 3] },
          ],
        }),
      'OVERLAPPING_SEGMENTS',
    ],
    [
      'non-finite positions',
      () => createTimeline({ segments: [{ media: [0, 1], scroll: [0, 1] }] }).resolve(Infinity),
      'INVALID_TIMELINE',
    ],
  ] as const)('rejects %s', (_name, action, code) => {
    captureFrameByFrameError(action, code);
  });

  it.each([
    { snap: true },
    { fps: 0, snap: true },
    { fps: -24, snap: true },
    { fps: Number.POSITIVE_INFINITY, snap: true },
    { fps: 24, snap: false },
  ])('rejects invalid frame configuration %#', (frame) => {
    const options = {
      frame,
      segments: [{ media: [0, 1], scroll: [0, 1] }],
    } as unknown as TimelineOptions;

    captureFrameByFrameError(() => createTimeline(options), 'INVALID_FRAME_RATE');
  });

  it.each([
    [null, 'INVALID_TIMELINE'],
    [{ segments: [null] }, 'INVALID_SEGMENT'],
    [{ segments: [{ media: [0, 1], scroll: [0] }] }, 'INVALID_SEGMENT'],
    [{ segments: [{ media: [0, 1], scroll: [Number.NaN, 1] }] }, 'INVALID_SEGMENT'],
    [{ segments: [{ media: [0, Number.POSITIVE_INFINITY], scroll: [0, 1] }] }, 'INVALID_SEGMENT'],
    [{ segments: [{ media: [0, 1], scroll: [0, 1], scrollUnit: 'percent' }] }, 'INVALID_SEGMENT'],
    [{ segments: [{ clip: '   ', media: [0, 1], scroll: [0, 1] }] }, 'INVALID_SEGMENT'],
    [{ segments: [{ easing: 'ease', media: [0, 1], scroll: [0, 1] }] }, 'INVALID_SEGMENT'],
    [{ frame: null, segments: [{ media: [0, 1], scroll: [0, 1] }] }, 'INVALID_FRAME_RATE'],
  ] as const)('rejects invalid runtime input %#', (options, code) => {
    captureFrameByFrameError(() => createTimeline(options as unknown as TimelineOptions), code);
  });

  it('accepts an explicitly disabled frame configuration', () => {
    const timeline = createTimeline({
      frame: { snap: false },
      segments: [{ media: [0, 1], scroll: [0, 1] }],
    });

    expect(timeline.resolve(0.52).targetTime).toBe(0.52);
  });
});

describe('FrameByFrameError', () => {
  it('captures a readonly copy of structured details', () => {
    const details: Record<string, unknown> = { segmentIndex: 2 };
    const error = new FrameByFrameError('INVALID_SEGMENT', 'Invalid segment.', { details });

    details['segmentIndex'] = 3;

    expect(error.details).toEqual({ segmentIndex: 2 });
    expect(Object.isFrozen(error.details)).toBe(true);
  });
});
