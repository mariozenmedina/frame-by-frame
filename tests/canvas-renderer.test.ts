import { describe, expect, it, vi } from 'vitest';

import { createFrameByFrame } from '../src/canvas.js';
import { compileControllerConfig } from '../src/core/controller-config.js';
import { AssetCache } from '../src/media/asset-cache.js';
import {
  CanvasTargetRegistry,
  resolveCanvasDecoder,
  resolveCanvasTarget,
} from '../src/media/canvas-target.js';
import { createCanvasRenderer } from '../src/media/canvas-renderer.js';
import { VideoTargetRegistry } from '../src/media/video-target.js';
import { FakeCanvasElement, FakeMediaDocument, FakeVideoElement } from './helpers/fake-video.js';

import type { ControllerBindingConfig, ControllerConfig } from '../src/core/controller-config.js';
import type { VideoRendererDependencies, VideoRendererEvent } from '../src/media/video-renderer.js';
import type { TimelineResolution } from '../src/types.js';

const resolution = (time: number): TimelineResolution => ({
  phase: 'active',
  segmentIndex: 0,
  clipId: 'clip',
  rawProgress: time / 10,
  easedProgress: time / 10,
  requestedTime: time,
  targetTime: time,
});

const firstBinding = (config: ControllerConfig): ControllerBindingConfig => {
  const binding = config.bindings[0];

  if (binding === undefined) {
    throw new Error('Expected one compiled binding.');
  }

  return binding;
};

const compileBinding = (
  canvas: HTMLCanvasElement,
  decoder: HTMLVideoElement,
  options: Readonly<Record<string, unknown>> = {},
): ControllerBindingConfig =>
  firstBinding(
    compileControllerConfig(
      {
        axes: {
          y: {
            bindings: [
              {
                id: 'canvas',
                renderer: 'canvas',
                target: canvas,
                clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
                canvas: { decoderTarget: decoder, ...options },
                segments: [{ scroll: [0, 10], media: [0, 10] }],
              },
            ],
          },
        },
      },
      new Set(['video', 'canvas']),
    ),
  );

const setupRenderer = (options: Readonly<Record<string, unknown>> = {}) => {
  const document = new FakeMediaDocument();
  const canvas = new FakeCanvasElement(document);
  const decoder = new FakeVideoElement();
  const config = compileBinding(canvas.asCanvas(), decoder.asVideo(), options);
  const canvasHandle = resolveCanvasTarget(config, new CanvasTargetRegistry());
  const decoderHandle = resolveCanvasDecoder(
    config,
    canvasHandle.target,
    new VideoTargetRegistry(),
  );
  const events: VideoRendererEvent[] = [];
  const renderer = createCanvasRenderer(config, canvasHandle, decoderHandle, (event) => {
    events.push(event);
  });

  return { canvas, config, decoder, events, renderer };
};

describe('canvas renderer', () => {
  it('validates canvas options and structural breakpoint overrides before mount', () => {
    const base = {
      id: 'canvas',
      renderer: 'canvas' as const,
      target: '#canvas',
      clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
      segments: [{ scroll: [0, 1] as const, media: [0, 1] as const }],
    };

    expect(() =>
      createFrameByFrame({
        axes: { y: { bindings: [{ ...base, canvas: { pixelRatio: 0 } }] } },
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MEDIA_CONFIG' }));
    expect(() =>
      createFrameByFrame({
        axes: { y: { bindings: [{ ...base, canvas: { fit: 'crop' as never } }] } },
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MEDIA_CONFIG' }));
    expect(() =>
      createFrameByFrame({
        axes: { y: { bindings: [base] } },
        breakpoints: [
          {
            id: 'invalid',
            query: '(max-width: 1px)',
            override: {
              axes: {
                y: {
                  bindings: [
                    {
                      id: 'canvas',
                      canvas: { decoderTarget: '#other' } as never,
                    },
                  ],
                },
              },
            },
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_BREAKPOINT_CONFIG' }));
  });

  it('draws the latest decoded frame and resolves readiness after the first draw', async () => {
    const { canvas, decoder, events, renderer } = setupRenderer({
      fit: 'cover',
      imageSmoothingEnabled: false,
    });
    renderer.setResolution(resolution(2));
    const ready = renderer.whenReady();
    decoder.duration = 10;
    decoder.emit('loadedmetadata');
    decoder.emit('loadeddata');
    await ready;

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(300);
    expect(canvas.context.imageSmoothingEnabled).toBe(false);
    expect(canvas.context.drawCalls).toHaveLength(1);
    expect(canvas.context.drawCalls[0]).toEqual([decoder, 0, 60, 1920, 960, 0, 0, 600, 300]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'frame',
        clipId: 'clip',
        presentedTime: 2,
        width: 1920,
        height: 1080,
      }),
    );
    expect(renderer.getState()).toMatchObject({
      loadState: 'ready',
      activeClipId: 'clip',
      presentedTime: 2,
    });
    renderer.destroy();
    expect(renderer.getState()).toMatchObject({ loadState: 'unloaded', presentedTime: null });
  });

  it('deduplicates seek fallback and native frame notifications for the same output', async () => {
    const { canvas, decoder, events, renderer } = setupRenderer();
    decoder.enableFrameCallbacks();
    renderer.setResolution(resolution(3));
    decoder.duration = 10;
    decoder.emit('loadedmetadata');
    decoder.emit('loadeddata');
    decoder.emit('seeked');
    await Promise.resolve();
    decoder.presentFrame({ mediaTime: 3, width: 1920, height: 1080 });

    expect(canvas.context.drawCalls).toHaveLength(1);
    expect(events.filter((event) => event.type === 'frame')).toHaveLength(1);
    renderer.destroy();
  });

  it('attributes fallback draws to the seek that completed before applying a pending target', async () => {
    const { decoder, events, renderer } = setupRenderer();
    decoder.enableFrameCallbacks();
    renderer.setResolution(resolution(1));
    decoder.duration = 10;
    decoder.emit('loadedmetadata');
    renderer.setResolution(resolution(2));

    decoder.emit('seeked');
    await Promise.resolve();
    expect(events.filter((event) => event.type === 'frame').at(-1)).toMatchObject({
      type: 'frame',
      presentedTime: 1,
    });
    expect(decoder.currentTime).toBe(2);

    decoder.emit('seeked');
    await Promise.resolve();
    expect(events.filter((event) => event.type === 'frame').at(-1)).toMatchObject({
      type: 'frame',
      presentedTime: 2,
    });
    renderer.destroy();
  });

  it('resizes and redraws without submitting another seek', async () => {
    const { canvas, decoder, renderer } = setupRenderer({ pixelRatio: 1 });
    renderer.setResolution(resolution(4));
    decoder.duration = 10;
    decoder.emit('loadedmetadata');
    decoder.emit('loadeddata');
    await Promise.resolve();
    const seekCount = decoder.seekAssignments.length;

    canvas.clientWidth = 400;
    canvas.clientHeight = 200;
    renderer.resize();

    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
    expect(canvas.context.drawCalls).toHaveLength(2);
    expect(decoder.seekAssignments).toHaveLength(seekCount);
    renderer.destroy();
  });

  it('supports load, suspended activity, deferred draw readiness, unload, and cancelled config', async () => {
    const { canvas, decoder, renderer } = setupRenderer();
    decoder.videoWidth = 0;
    decoder.videoHeight = 0;
    renderer.setActivity('suspended');
    renderer.setResolution(resolution(5));
    renderer.setActivity('active');
    const loaded = renderer.load();
    const ready = renderer.whenReady();
    decoder.duration = 10;
    decoder.emit('loadedmetadata');
    await loaded;
    decoder.emit('loadeddata');
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }

    decoder.videoWidth = 1920;
    decoder.videoHeight = 1080;
    renderer.resize();
    await ready;
    expect(canvas.context.drawCalls).toHaveLength(1);

    const next = compileBinding(canvas.asCanvas(), decoder.asVideo(), { fit: 'fill' });
    renderer.prepareConfig(next).cancel();
    renderer.unload();
    expect(renderer.getState().loadState).toBe('unloaded');
    renderer.destroy();
  });

  it('observes the visible canvas for target-near-viewport loading', () => {
    const document = new FakeMediaDocument();
    const canvas = new FakeCanvasElement(document);
    const decoder = new FakeVideoElement();
    const config = firstBinding(
      compileControllerConfig(
        {
          axes: {
            y: {
              bindings: [
                {
                  id: 'canvas',
                  renderer: 'canvas',
                  target: canvas.asCanvas(),
                  canvas: { decoderTarget: decoder.asVideo() },
                  clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
                  loading: {
                    mode: 'on-demand',
                    trigger: 'target-near-viewport',
                    rootMargin: '400px',
                  },
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
    const stop = vi.fn();
    const observeNearViewport = vi.fn<VideoRendererDependencies['observeNearViewport']>(() => stop);
    const dependencies: VideoRendererDependencies = {
      assetCache: new AssetCache({
        fetch: globalThis.fetch,
        createObjectURL: (blob) => URL.createObjectURL(blob),
        revokeObjectURL: (url) => {
          URL.revokeObjectURL(url);
        },
      }),
      resolveUrl: (source) => new URL(source, 'https://example.com/').href,
      observeNearViewport,
    };
    const renderer = createCanvasRenderer(
      config,
      canvasHandle,
      decoderHandle,
      vi.fn(),
      'active',
      dependencies,
    );

    expect(observeNearViewport).toHaveBeenCalledWith(canvas, '400px', expect.any(Function));
    renderer.destroy();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('applies responsive presentation changes without replacing targets', async () => {
    const { canvas, config, decoder, renderer } = setupRenderer({ fit: 'contain' });
    renderer.setResolution(resolution(2));
    decoder.duration = 10;
    decoder.emit('loadedmetadata');
    decoder.emit('loadeddata');
    await Promise.resolve();
    const loadCalls = decoder.loadCalls;
    const drawCalls = canvas.context.drawCalls.length;
    const next = compileBinding(canvas.asCanvas(), decoder.asVideo(), {
      fit: 'fill',
      pixelRatio: 1,
    });
    const transaction = renderer.prepareConfig(next);
    transaction.commit();
    await Promise.resolve();

    expect(renderer.getTarget()).toBe(canvas);
    expect(decoder.loadCalls).toBe(loadCalls);
    expect(canvas.context.drawCalls).toHaveLength(drawCalls + 1);
    expect(() => renderer.prepareConfig({ ...config, renderer: 'video' })).toThrow(
      expect.objectContaining({ code: 'INVALID_BREAKPOINT_CONFIG' }),
    );
    renderer.destroy();
  });

  it('isolates unavailable 2D contexts in binding state', async () => {
    const document = new FakeMediaDocument();
    const canvas = new FakeCanvasElement(document);
    canvas.contextAvailable = false;
    const decoder = new FakeVideoElement();
    const config = compileBinding(canvas.asCanvas(), decoder.asVideo());
    const canvasRegistry = new CanvasTargetRegistry();
    const videoRegistry = new VideoTargetRegistry();
    const canvasHandle = resolveCanvasTarget(config, canvasRegistry);
    const decoderHandle = resolveCanvasDecoder(config, canvasHandle.target, videoRegistry);
    const onEvent = vi.fn<(event: VideoRendererEvent) => void>();
    const renderer = createCanvasRenderer(config, canvasHandle, decoderHandle, onEvent);
    await Promise.resolve();

    expect(renderer.getState()).toMatchObject({
      loadState: 'error',
      error: { code: 'CANVAS_CONTEXT_UNAVAILABLE' },
    });
    await expect(renderer.whenReady()).rejects.toMatchObject({
      code: 'CANVAS_CONTEXT_UNAVAILABLE',
    });
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      type: 'error',
      error: { code: 'CANVAS_CONTEXT_UNAVAILABLE' },
    });
    renderer.destroy();
  });

  it('reports canvas security failures without throwing from media events', async () => {
    const { canvas, decoder, events, renderer } = setupRenderer();
    const error = new Error('tainted');
    error.name = 'SecurityError';
    canvas.context.drawError = error;
    renderer.setResolution(resolution(1));
    const ready = renderer.whenReady();
    decoder.duration = 10;
    decoder.emit('loadedmetadata');
    decoder.emit('loadeddata');

    await expect(ready).rejects.toMatchObject({ code: 'CANVAS_SECURITY_ERROR' });
    expect(events.find((event) => event.type === 'error')).toMatchObject({
      type: 'error',
      error: { code: 'CANVAS_SECURITY_ERROR' },
    });
    expect(renderer.getState()).toMatchObject({
      loadState: 'error',
      error: { code: 'CANVAS_SECURITY_ERROR' },
    });
    renderer.destroy();
  });
});
