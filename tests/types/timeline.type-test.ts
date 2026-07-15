import { createTimeline, FrameByFrameError } from '../../src/index.js';

import type {
  EasingFunction,
  FrameByFrameErrorCode,
  ScrollUnit,
  Timeline,
  TimelineResolution,
} from '../../src/types.js';

export const verifyTimelineTypes = (): void => {
  const customEasing: EasingFunction = (progress) => progress;
  const timeline: Timeline = createTimeline({
    easing: customEasing,
    frame: { fps: 30, snap: true },
    segments: [
      {
        clip: 'intro',
        media: [0, 5],
        scroll: [0, 1],
        scrollUnit: 'progress',
      },
    ],
  });
  const unit: ScrollUnit = timeline.unit;
  const resolution: TimelineResolution = timeline.resolve(0.5);
  const code: FrameByFrameErrorCode = 'INVALID_SEGMENT';
  const error = new FrameByFrameError(code, 'Invalid segment.');

  void unit;
  void code;

  // @ts-expect-error: Timeline resolution snapshots are readonly.
  resolution.targetTime = 4;

  // @ts-expect-error: Package error causes are readonly.
  error.cause = new Error('replacement');

  // @ts-expect-error: Unsupported scroll units are rejected by the public type.
  createTimeline({ segments: [{ media: [0, 1], scroll: [0, 1], scrollUnit: 'percent' }] });

  // @ts-expect-error: Enabling frame snapping requires fps.
  createTimeline({ frame: { snap: true }, segments: [{ media: [0, 1], scroll: [0, 1] }] });

  createTimeline({
    // @ts-expect-error: Frame rate is not accepted while snapping is disabled.
    frame: { fps: 30, snap: false },
    segments: [{ media: [0, 1], scroll: [0, 1] }],
  });
};
