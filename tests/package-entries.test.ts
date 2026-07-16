import { describe, expect, it } from 'vitest';

import * as canvas from '../src/canvas.js';
import * as core from '../src/index.js';
import * as types from '../src/types.js';
import * as video from '../src/video.js';
import { createFakeScrollEnvironment } from './helpers/fake-scroll-source.js';
import { FakeCanvasElement, FakeMediaDocument, FakeVideoElement } from './helpers/fake-video.js';

describe('package entry points', () => {
  it('exposes the controller and pure timeline APIs from the core entry point', () => {
    expect(Object.keys(core).sort()).toEqual([
      'FrameByFrameError',
      'createFrameByFrame',
      'createTimeline',
    ]);
  });

  it('exposes the canvas-enabled controller and pure APIs from the canvas entry point', () => {
    expect(Object.keys(canvas).sort()).toEqual([
      'FrameByFrameError',
      'createFrameByFrame',
      'createTimeline',
    ]);

    const controller = canvas.createFrameByFrame({
      axes: {
        y: {
          bindings: [
            {
              id: 'canvas',
              renderer: 'canvas',
              target: '#canvas',
              clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
              segments: [{ scroll: [0, 1], media: [0, 1] }],
            },
          ],
        },
      },
    });

    expect(controller.getState().bindings['canvas']).toMatchObject({
      renderer: 'canvas',
      loadState: 'idle',
    });
  });

  it('mounts both renderer branches through the canvas-enabled factory', async () => {
    const scroll = createFakeScrollEnvironment();
    const mediaDocument = new FakeMediaDocument();
    const visibleCanvas = new FakeCanvasElement(mediaDocument);
    const canvasDecoder = new FakeVideoElement();
    const videoTarget = new FakeVideoElement();
    const source = scroll.element as unknown as HTMLElement;

    const canvasController = canvas.createFrameByFrame({
      source,
      axes: {
        y: {
          bindings: [
            {
              id: 'canvas',
              renderer: 'canvas',
              target: visibleCanvas.asCanvas(),
              canvas: { decoderTarget: canvasDecoder.asVideo() },
              clips: [{ id: 'clip', sources: [{ src: '/canvas.mp4' }] }],
              segments: [{ scroll: [0, 1], media: [0, 1] }],
            },
          ],
        },
      },
    });
    await canvasController.mount();
    expect(canvasController.getTarget('canvas')).toBe(visibleCanvas);
    canvasController.destroy();

    const videoController = canvas.createFrameByFrame({
      source,
      axes: {
        y: {
          bindings: [
            {
              id: 'video',
              target: videoTarget.asVideo(),
              clips: [{ id: 'clip', sources: [{ src: '/video.mp4' }] }],
              segments: [{ scroll: [0, 1], media: [0, 1] }],
            },
          ],
        },
      },
    });
    await videoController.mount();
    expect(videoController.getTarget('video')).toBe(videoTarget);
    videoController.destroy();
  });

  it.each([
    ['video', video],
    ['types', types],
  ])('keeps the reserved %s entry point free of runtime exports', (_name, entryPoint) => {
    expect(Object.keys(entryPoint)).toEqual([]);
  });
});
