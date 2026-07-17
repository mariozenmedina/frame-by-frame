import { describe, expect, it } from 'vitest';

import { compileControllerConfig } from '../src/core/controller-config.js';
import {
  CanvasTargetRegistry,
  resolveCanvasDecoder,
  resolveCanvasTarget,
} from '../src/media/canvas-target.js';
import { VideoTargetRegistry } from '../src/media/video-target.js';
import {
  FakeCanvasElement,
  FakeMediaContainer,
  FakeMediaDocument,
  FakeVideoElement,
  installDocument,
} from './helpers/fake-video.js';

import type { ControllerBindingConfig, ControllerConfig } from '../src/core/controller-config.js';

const firstBinding = (config: ControllerConfig): ControllerBindingConfig => {
  const binding = config.bindings[0];

  if (binding === undefined) {
    throw new Error('Expected one compiled binding.');
  }

  return binding;
};

const compileBinding = (target: HTMLCanvasElement, decoderTarget?: HTMLVideoElement) =>
  firstBinding(
    compileControllerConfig(
      {
        axes: {
          y: {
            bindings: [
              {
                id: 'canvas',
                renderer: 'canvas',
                target,
                clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
                canvas: { ...(decoderTarget === undefined ? {} : { decoderTarget }) },
                segments: [{ scroll: [0, 1], media: [0, 1] }],
              },
            ],
          },
        },
      },
      new Set(['video', 'canvas']),
    ),
  );

describe('canvas targets', () => {
  it('claims supplied canvas and decoder targets and releases both', () => {
    const document = new FakeMediaDocument();
    const canvas = new FakeCanvasElement(document);
    const decoder = new FakeVideoElement();
    const config = compileBinding(canvas.asCanvas(), decoder.asVideo());
    const canvasRegistry = new CanvasTargetRegistry();
    const videoRegistry = new VideoTargetRegistry();
    const canvasHandle = resolveCanvasTarget(config, canvasRegistry);
    const decoderHandle = resolveCanvasDecoder(config, canvasHandle.target, videoRegistry);

    expect(canvasHandle).toMatchObject({ target: canvas, owned: false });
    expect(decoderHandle).toMatchObject({ target: decoder, owned: false });
    expect(() => resolveCanvasTarget(config, canvasRegistry)).toThrow(
      expect.objectContaining({ code: 'TARGET_CONFLICT' }),
    );

    decoderHandle.release();
    canvasHandle.release();
    expect(() => resolveCanvasTarget(config, canvasRegistry)).not.toThrow();
  });

  it('creates an owned canvas and a detached owned decoder', () => {
    const document = new FakeMediaDocument();
    const container = new FakeMediaContainer(document);
    const config = firstBinding(
      compileControllerConfig(
        {
          axes: {
            y: {
              bindings: [
                {
                  id: 'created',
                  renderer: 'canvas',
                  mountTo: container.asElement(),
                  clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
                  segments: [{ scroll: [0, 1], media: [0, 1] }],
                },
              ],
            },
          },
        },
        new Set(['video', 'canvas']),
      ),
    );
    const canvasHandle = resolveCanvasTarget(config, new CanvasTargetRegistry());
    const decoderHandle = resolveCanvasDecoder(
      config,
      canvasHandle.target,
      new VideoTargetRegistry(),
    );

    expect(canvasHandle.owned).toBe(true);
    expect(container.children).toEqual([canvasHandle.target]);
    expect(decoderHandle.owned).toBe(true);
    expect(decoderHandle.target.parentNode).toBeNull();
    expect(document.created).toContain(decoderHandle.target);

    decoderHandle.release();
    canvasHandle.release();
    expect(container.children).toEqual([]);
  });

  it('resolves selector references only when targets are mounted', () => {
    const document = new FakeMediaDocument();
    const canvas = new FakeCanvasElement(document);
    const decoder = new FakeVideoElement();
    document.selections.set('#canvas', canvas);
    document.selections.set('#decoder', decoder);
    const restore = installDocument(document);

    try {
      const config = firstBinding(
        compileControllerConfig(
          {
            axes: {
              y: {
                bindings: [
                  {
                    id: 'selected',
                    renderer: 'canvas',
                    target: '#canvas',
                    canvas: { decoderTarget: '#decoder' },
                    clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
                    segments: [{ scroll: [0, 1], media: [0, 1] }],
                  },
                ],
              },
            },
          },
          new Set(['video', 'canvas']),
        ),
      );
      const canvasHandle = resolveCanvasTarget(config, new CanvasTargetRegistry());
      const decoderHandle = resolveCanvasDecoder(
        config,
        canvasHandle.target,
        new VideoTargetRegistry(),
      );

      expect(canvasHandle.target).toBe(canvas);
      expect(decoderHandle.target).toBe(decoder);
      decoderHandle.release();
      canvasHandle.release();
    } finally {
      restore();
    }
  });

  it('rejects a resolved target that is not a canvas', () => {
    const document = new FakeMediaDocument();
    const canvas = new FakeCanvasElement(document);
    const config = compileBinding(canvas.asCanvas());
    const invalidConfig = { ...config, target: new FakeVideoElement().asVideo() };

    expect(() => resolveCanvasTarget(invalidConfig, new CanvasTargetRegistry())).toThrow(
      expect.objectContaining({ code: 'INVALID_TARGET_TYPE' }),
    );
  });
});
