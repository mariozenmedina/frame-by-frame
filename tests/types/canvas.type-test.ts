import { createFrameByFrame as createCanvasFrameByFrame } from '../../src/canvas.js';
import { createFrameByFrame as createVideoFrameByFrame } from '../../src/index.js';

import type { CanvasFrameByFrameController } from '../../src/types.js';

export const verifyCanvasControllerTypes = (
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void => {
  const controller: CanvasFrameByFrameController = createCanvasFrameByFrame({
    axes: {
      y: {
        bindings: [
          {
            id: 'canvas',
            renderer: 'canvas',
            target: canvas,
            clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
            canvas: {
              fit: 'cover',
              pixelRatio: 'device',
              imageSmoothingEnabled: true,
              decoderTarget: () => video,
            },
            segments: [{ scroll: [0, 1], media: [0, 1] }],
          },
          {
            id: 'video',
            target: video,
            clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
            segments: [{ scroll: [0, 1], media: [0, 1] }],
          },
        ],
      },
    },
    breakpoints: [
      {
        id: 'compact',
        query: '(max-width: 640px)',
        override: {
          axes: {
            y: {
              bindings: [
                {
                  id: 'canvas',
                  canvas: { fit: 'contain', pixelRatio: 1 },
                },
              ],
            },
          },
        },
      },
    ],
  });

  const target: HTMLVideoElement | HTMLCanvasElement | null = controller.getTarget('canvas');
  void target;

  createVideoFrameByFrame({
    axes: {
      y: {
        bindings: [
          {
            id: 'canvas',
            // @ts-expect-error: Canvas bindings require the opt-in canvas entry point.
            renderer: 'canvas',
            // @ts-expect-error: The root entry accepts video targets only.
            target: canvas,
            clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
            segments: [{ scroll: [0, 1], media: [0, 1] }],
          },
        ],
      },
    },
  });

  createCanvasFrameByFrame({
    axes: {
      y: {
        bindings: [
          // @ts-expect-error: A canvas binding cannot use a video as its visible target.
          {
            id: 'invalid-target',
            renderer: 'canvas',
            target: video,
            clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
            segments: [{ scroll: [0, 1], media: [0, 1] }],
          },
        ],
      },
    },
  });

  createCanvasFrameByFrame({
    axes: { y: { bindings: [] as never } },
    breakpoints: [
      {
        id: 'invalid-decoder',
        query: '(max-width: 1px)',
        override: {
          axes: {
            y: {
              bindings: [
                {
                  id: 'canvas',
                  canvas: {
                    // @ts-expect-error: Responsive overrides cannot replace decoder ownership.
                    decoderTarget: video,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  });
};
