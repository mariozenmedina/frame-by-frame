import { createFrameByFrame, createTimeline, FrameByFrameError } from '../../src/video.js';

import type {
  FrameByFrameController,
  FrameByFrameErrorCode,
  FrameByFrameOptions,
  Timeline,
} from '../../src/video.js';

export const verifyExplicitVideoEntryTypes = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): void => {
  const options: FrameByFrameOptions = {
    axes: {
      y: {
        bindings: [
          {
            id: 'video',
            target: () => video,
            clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
            segments: [{ scroll: [0, 1], media: [0, 1] }],
          },
        ],
      },
    },
  };
  const controller: FrameByFrameController = createFrameByFrame(options);
  const timeline: Timeline = createTimeline({
    segments: [{ scroll: [0, 1], media: [0, 1] }],
  });
  const code: FrameByFrameErrorCode = 'INVALID_MEDIA_CONFIG';
  const error = new FrameByFrameError(code, 'Invalid explicit video configuration.');

  void controller;
  void timeline;
  void error;

  createFrameByFrame({
    axes: {
      y: {
        bindings: [
          {
            id: 'canvas',
            // @ts-expect-error: The explicit video entry remains video-only.
            renderer: 'canvas',
            // @ts-expect-error: The explicit video entry rejects canvas targets.
            target: canvas,
            clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
            segments: [{ scroll: [0, 1], media: [0, 1] }],
          },
        ],
      },
    },
  });
};
