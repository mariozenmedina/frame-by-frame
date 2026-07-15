import { describe, expect, it, vi } from 'vitest';

import { compileControllerConfig } from '../src/core/controller-config.js';
import { createNativeVideoRenderer } from '../src/media/video-renderer.js';
import { FakeVideoElement } from './helpers/fake-video.js';

import type { ResolvedVideoTarget } from '../src/media/video-target.js';
import type { VideoRendererEvent } from '../src/media/video-renderer.js';
import type { TimelineResolution, VideoClipConfig } from '../src/types.js';

const compileBinding = (
  target: FakeVideoElement,
  clips: readonly VideoClipConfig[],
  extra: object = {},
) => {
  const binding = compileControllerConfig({
    axes: {
      y: {
        bindings: [
          {
            id: 'story',
            target: target.asVideo(),
            clips,
            segments: clips.map((clip, index) => ({
              clip: clip.id,
              media: [0, 10] as const,
              scroll: [index, index + 1] as const,
            })),
            ...extra,
          },
        ],
      },
    },
  }).bindings[0];

  if (binding === undefined) {
    throw new Error('Expected a compiled video binding.');
  }

  return binding;
};

const createHandle = (target: FakeVideoElement, owned = false) => {
  const release = vi.fn();
  const handle: ResolvedVideoTarget = { target: target.asVideo(), owned, release };
  return { handle, release };
};

const resolveAt = (clipId: string, targetTime: number, requestedTime = targetTime) =>
  ({
    phase: 'active',
    segmentIndex: 0,
    clipId,
    rawProgress: 0,
    easedProgress: 0,
    requestedTime,
    targetTime,
  }) satisfies TimelineResolution;

describe('native video renderer', () => {
  it('applies owned-target defaults and releases the target on destroy', () => {
    const target = new FakeVideoElement();
    const { handle, release } = createHandle(target, true);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }]),
      handle,
      vi.fn(),
    );

    expect(target).toMatchObject({
      muted: true,
      defaultMuted: true,
      playsInline: true,
      controls: false,
      loop: false,
      autoplay: false,
    });
    renderer.destroy();
    renderer.destroy();
    expect(release).toHaveBeenCalledOnce();
    expect(renderer.getState().loadState).toBe('unloaded');
  });

  it('restores supplied-target attributes and property overrides on destroy', () => {
    const target = new FakeVideoElement();
    target.setAttribute('src', '/original.mp4');
    target.setAttribute('poster', '/original.jpg');
    target.muted = false;
    target.defaultMuted = false;
    target.controls = true;
    target.loop = true;
    target.autoplay = true;
    target.srcObject = { original: true };
    const { handle } = createHandle(target);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }], {
        video: { muted: true, controls: false, loop: false, playsInline: true },
      }),
      handle,
      vi.fn(),
    );

    renderer.setResolution(resolveAt('intro', 2));
    renderer.destroy();

    expect(target.getAttribute('src')).toBe('/original.mp4');
    expect(target.getAttribute('poster')).toBe('/original.jpg');
    expect(target).toMatchObject({
      muted: false,
      defaultMuted: false,
      controls: true,
      loop: true,
      autoplay: true,
      srcObject: { original: true },
    });
  });

  it('filters typed sources, clamps seeks, and keeps only the latest pending seek', async () => {
    const target = new FakeVideoElement();
    const events = vi.fn<(event: VideoRendererEvent) => void>();
    const { handle } = createHandle(target);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [
        {
          id: 'intro',
          sources: [
            { src: '/unsupported.webm', type: 'video/unsupported' },
            { src: '/intro.mp4', type: 'video/mp4' },
          ],
          poster: '/intro.jpg',
          crossOrigin: 'anonymous',
          preload: 'auto',
        },
      ]),
      handle,
      events,
    );

    renderer.setResolution(resolveAt('intro', 8));
    const loading = renderer.load();
    expect(renderer.getTarget()).toBe(target);
    expect(target.getAttribute('src')).toBe('/intro.mp4');
    expect(target).toMatchObject({
      poster: '/intro.jpg',
      crossOrigin: 'anonymous',
      preload: 'auto',
    });

    target.duration = 4;
    target.emit('loadedmetadata');
    await loading;
    expect(target.seekAssignments).toEqual([4]);

    renderer.setResolution(resolveAt('intro', 2));
    renderer.setResolution(resolveAt('intro', 3));
    expect(target.seekAssignments).toEqual([4]);
    target.emit('seeked');
    expect(target.seekAssignments).toEqual([4, 3]);
    target.emit('seeked');
    target.emit('loadeddata');

    expect(renderer.getState()).toMatchObject({
      loadState: 'ready',
      duration: 4,
      appliedTime: 3,
      presentedTime: 3,
      seeking: false,
    });
    expect(events.mock.calls.map(([event]) => event.type)).toEqual([
      'loadstart',
      'loadedmetadata',
      'seekrequest',
      'frame',
      'seekrequest',
      'frame',
      'loadready',
      'frame',
    ]);
  });

  it('tries ordered source candidates and reports a binding-scoped terminal failure', () => {
    const target = new FakeVideoElement();
    const events = vi.fn<(event: VideoRendererEvent) => void>();
    const { handle } = createHandle(target);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [
        {
          id: 'intro',
          sources: [{ src: '/first.mp4' }, { src: '/second.mp4' }],
        },
      ]),
      handle,
      events,
    );

    renderer.setResolution(resolveAt('intro', 1));
    expect(target.getAttribute('src')).toBe('/first.mp4');
    target.emit('error');
    expect(target.getAttribute('src')).toBe('/second.mp4');
    target.error = { code: 3 };
    target.emit('error');

    expect(renderer.getState()).toMatchObject({
      loadState: 'error',
      error: {
        code: 'MEDIA_DECODE_FAILED',
        details: { bindingId: 'story', clipId: 'intro', source: '/second.mp4' },
      },
    });
    const terminalEvent = events.mock.calls.at(-1)?.[0];
    expect(terminalEvent?.type).toBe('error');

    if (terminalEvent?.type === 'error') {
      expect(terminalEvent.error.code).toBe('MEDIA_DECODE_FAILED');
    }
  });

  it('supports explicit unload and reload without implicit loading', async () => {
    const target = new FakeVideoElement();
    const { handle } = createHandle(target);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }]),
      handle,
      vi.fn(),
    );

    renderer.setResolution(resolveAt('intro', 1));
    renderer.unload();
    const callsAfterUnload = target.loadCalls;
    renderer.setResolution(resolveAt('intro', 2));
    expect(target.loadCalls).toBe(callsAfterUnload);
    expect(renderer.getState().loadState).toBe('unloaded');

    const loading = renderer.load();
    expect(renderer.getState().loadState).toBe('loading');
    target.duration = 10;
    target.emit('loadedmetadata');
    await loading;
    expect(renderer.getState().activeClipId).toBe('intro');
  });

  it('observes one composed frame with requestVideoFrameCallback and cancels stale work', () => {
    const target = new FakeVideoElement();
    target.enableFrameCallbacks();
    const events = vi.fn<(event: VideoRendererEvent) => void>();
    const { handle } = createHandle(target);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }]),
      handle,
      events,
    );

    renderer.setResolution(resolveAt('intro', 2));
    target.duration = 10;
    target.emit('loadedmetadata');
    expect(target.frameCallbacks.size).toBe(1);
    target.presentFrame({ mediaTime: 2.01, expectedDisplayTime: 30, width: 1920, height: 1080 });

    expect(renderer.getState().presentedTime).toBe(2.01);
    expect(events).toHaveBeenCalledWith({
      type: 'frame',
      clipId: 'intro',
      presentedTime: 2.01,
      expectedDisplayTime: 30,
      width: 1920,
      height: 1080,
    });

    renderer.setResolution(resolveAt('intro', 3));
    target.emit('seeked');
    expect(target.frameCallbacks.size).toBe(1);
    renderer.destroy();
    expect(target.cancelledFrameCallbacks.length).toBeGreaterThan(0);
  });

  it('reports unsupported sources and rejected native seeks', () => {
    const unsupportedTarget = new FakeVideoElement();
    const unsupportedEvents = vi.fn<(event: VideoRendererEvent) => void>();
    const unsupported = createNativeVideoRenderer(
      compileBinding(unsupportedTarget, [
        {
          id: 'intro',
          sources: [{ src: '/intro.bin', type: 'video/unsupported' }],
        },
      ]),
      createHandle(unsupportedTarget).handle,
      unsupportedEvents,
    );
    unsupported.setResolution(resolveAt('intro', 1));
    expect(unsupported.getState().error?.code).toBe('MEDIA_SOURCE_UNSUPPORTED');

    const seekTarget = new FakeVideoElement();
    const seekEvents = vi.fn<(event: VideoRendererEvent) => void>();
    const seeking = createNativeVideoRenderer(
      compileBinding(seekTarget, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }]),
      createHandle(seekTarget).handle,
      seekEvents,
    );
    seeking.setResolution(resolveAt('intro', 1));
    seekTarget.duration = 10;
    seekTarget.throwOnSeek = new Error('seek rejected');
    seekTarget.emit('loadedmetadata');
    expect(seeking.getState().error?.code).toBe('MEDIA_SEEK_FAILED');
    const seekEvent = seekEvents.mock.calls.at(-1)?.[0];
    expect(seekEvent?.type).toBe('error');

    if (seekEvent?.type === 'error') {
      expect(seekEvent.error).toBeInstanceOf(Error);
    }
  });
});
