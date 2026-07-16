import { describe, expect, it, vi } from 'vitest';

import { compileControllerConfig } from '../src/core/controller-config.js';
import { AssetCache } from '../src/media/asset-cache.js';
import { createNativeVideoRenderer } from '../src/media/video-renderer.js';
import { FakeVideoElement } from './helpers/fake-video.js';

import type { ResolvedVideoTarget } from '../src/media/video-target.js';
import type { VideoRendererDependencies, VideoRendererEvent } from '../src/media/video-renderer.js';
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

const createFullPreloadDependencies = (
  fetch: typeof globalThis.fetch,
  observeNearViewport: VideoRendererDependencies['observeNearViewport'] = () => vi.fn(),
) => {
  const createObjectURL = vi.fn(
    (blob: Blob) => `blob:${String(blob.size)}:${String(createObjectURL.mock.calls.length)}`,
  );
  const revokeObjectURL = vi.fn();
  const dependencies: VideoRendererDependencies = {
    assetCache: new AssetCache({
      fetch: (url, init) => fetch(url, init),
      createObjectURL,
      revokeObjectURL,
    }),
    resolveUrl: (source) => new URL(source, 'https://example.com/').href,
    observeNearViewport,
  };
  return { createObjectURL, dependencies, revokeObjectURL };
};

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
};

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
    renderer.resize();
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

  it('fully preloads all immediate clips and waits for the active target to become ready', async () => {
    const target = new FakeVideoElement();
    const events = vi.fn<(event: VideoRendererEvent) => void>();
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const bytes = requestUrl(input).includes('intro') ? [1, 2] : [3, 4, 5];
      return Promise.resolve(
        new Response(new Uint8Array(bytes), {
          headers: {
            'content-length': String(bytes.length),
            'content-type': 'video/mp4',
          },
        }),
      );
    });
    const { dependencies, revokeObjectURL } = createFullPreloadDependencies(fetch);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [
        { id: 'intro', sources: [{ src: '/intro.mp4' }], preload: 'full' },
        { id: 'detail', sources: [{ src: '/detail.mp4' }], preload: 'full' },
      ]),
      createHandle(target).handle,
      events,
      dependencies,
    );

    renderer.setResolution(resolveAt('intro', 1));
    const readiness = renderer.whenReady();
    await vi.waitFor(() => {
      expect(target.getAttribute('src')).toMatch(/^blob:/);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(target.preload).toBe('auto');
    target.duration = 5;
    target.emit('loadedmetadata');
    target.emit('loadeddata');
    await expect(readiness).resolves.toBeUndefined();
    expect(renderer.getState().loadProgress).toEqual({
      intro: { loadedBytes: 2, totalBytes: 2, ratio: 1 },
      detail: { loadedBytes: 3, totalBytes: 3, ratio: 1 },
    });
    expect(events.mock.calls.some(([event]) => event.type === 'loadprogress')).toBe(true);

    renderer.destroy();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('tries the next source when a full-preload request fails', async () => {
    const target = new FakeVideoElement();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));
    const { dependencies } = createFullPreloadDependencies(fetch);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [
        {
          id: 'intro',
          sources: [{ src: '/first.mp4' }, { src: '/second.mp4' }],
          preload: 'full',
        },
      ]),
      createHandle(target).handle,
      vi.fn(),
      dependencies,
    );

    renderer.setResolution(resolveAt('intro', 1));
    await vi.waitFor(() => {
      expect(target.getAttribute('src')).toMatch(/^blob:/);
    });
    target.emit('loadedmetadata');
    target.emit('loadeddata');
    await renderer.whenReady();
    expect(fetch.mock.calls.map(([input]) => requestUrl(input))).toEqual([
      'https://example.com/first.mp4',
      'https://example.com/second.mp4',
    ]);
    expect(renderer.getState().selectedSource).toBe('/second.mp4');
    renderer.destroy();
  });

  it('defers viewport loading until the observer enters and disconnects after activation', async () => {
    const target = new FakeVideoElement();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(new Uint8Array([1]))),
    );
    let enter: (() => void) | null = null;
    const disconnect = vi.fn();
    const observeNearViewport = vi.fn((_target, rootMargin: string, onEnter: () => void) => {
      expect(rootMargin).toBe('400px 0px');
      enter = onEnter;
      return disconnect;
    });
    const { dependencies } = createFullPreloadDependencies(fetch, observeNearViewport);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }], preload: 'full' }], {
        loading: {
          mode: 'on-demand',
          trigger: 'target-near-viewport',
          rootMargin: '400px 0px',
        },
      }),
      createHandle(target).handle,
      vi.fn(),
      dependencies,
    );

    renderer.setResolution(resolveAt('intro', 1));
    await expect(renderer.whenReady()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    (enter as unknown as () => void)();
    expect(disconnect).toHaveBeenCalledOnce();
    const readiness = renderer.whenReady();
    await vi.waitFor(() => {
      expect(target.getAttribute('src')).toMatch(/^blob:/);
    });
    target.emit('loadedmetadata');
    target.emit('loadeddata');
    await readiness;
    expect(fetch).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it('loads only the first-used full clip for a first-use policy', async () => {
    const target = new FakeVideoElement();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(new Uint8Array([1]))),
    );
    const { dependencies } = createFullPreloadDependencies(fetch);
    const renderer = createNativeVideoRenderer(
      compileBinding(
        target,
        [
          { id: 'intro', sources: [{ src: '/intro.mp4' }], preload: 'full' },
          { id: 'detail', sources: [{ src: '/detail.mp4' }], preload: 'full' },
        ],
        { loading: { mode: 'on-demand', trigger: 'first-use' } },
      ),
      createHandle(target).handle,
      vi.fn(),
      dependencies,
    );

    expect(fetch).not.toHaveBeenCalled();
    renderer.setResolution(resolveAt('intro', 1));
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });
    const firstRequest = fetch.mock.calls[0]?.[0];
    expect(firstRequest === undefined ? '' : requestUrl(firstRequest)).toContain('/intro.mp4');
    renderer.destroy();
  });

  it('makes pending readiness follow the latest desired clip generation', async () => {
    const target = new FakeVideoElement();
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [
        { id: 'intro', sources: [{ src: '/intro.mp4' }], preload: 'auto' },
        { id: 'detail', sources: [{ src: '/detail.mp4' }], preload: 'metadata' },
      ]),
      createHandle(target).handle,
      vi.fn(),
    );

    renderer.setResolution(resolveAt('intro', 1));
    const readiness = renderer.whenReady();
    let settled = false;
    void readiness.then((): void => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    renderer.setResolution(resolveAt('detail', 2));
    await Promise.resolve();
    expect(settled).toBe(false);
    target.duration = 4;
    target.emit('loadedmetadata');
    await readiness;
    expect(settled).toBe(true);
    expect(renderer.getState().activeClipId).toBe('detail');
    renderer.destroy();
  });

  it('uses the default browser dependencies for full preload without import-time access', async () => {
    const target = new FakeVideoElement();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2]), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }], preload: 'full' }]),
      createHandle(target).handle,
      vi.fn(),
    );

    try {
      renderer.setResolution(resolveAt('intro', 1));
      const readiness = renderer.whenReady();
      await vi.waitFor(() => {
        expect(target.getAttribute('src')).toMatch(/^blob:/);
      });
      target.emit('loadedmetadata');
      target.emit('loadeddata');
      await readiness;
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/intro.mp4',
        expect.objectContaining({ credentials: 'same-origin', cache: 'default' }),
      );
    } finally {
      renderer.destroy();
      vi.unstubAllGlobals();
    }
  });

  it('uses a one-shot default IntersectionObserver for viewport activation', () => {
    const target = new FakeVideoElement();
    const callbacks: IntersectionObserverCallback[] = [];
    const observe = vi.fn();
    const disconnect = vi.fn();

    class TestIntersectionObserver {
      constructor(nextCallback: IntersectionObserverCallback) {
        callbacks.push(nextCallback);
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn((): IntersectionObserverEntry[] => []);
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0];
    }

    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }], {
        loading: {
          mode: 'on-demand',
          trigger: 'target-near-viewport',
          rootMargin: '200px',
        },
      }),
      createHandle(target).handle,
      vi.fn(),
    );

    try {
      renderer.setResolution(resolveAt('intro', 1));
      expect(target.getAttribute('src')).toBeNull();

      const callback = callbacks[0];

      if (callback === undefined) {
        throw new Error('Expected an IntersectionObserver callback.');
      }

      const entry = { isIntersecting: true } as IntersectionObserverEntry;
      const observer = {} as IntersectionObserver;
      callback([entry], observer);
      expect(observe).toHaveBeenCalledWith(target);
      expect(disconnect).toHaveBeenCalledOnce();
      expect(target.getAttribute('src')).toBe('/intro.mp4');
    } finally {
      renderer.destroy();
      vi.unstubAllGlobals();
    }
  });

  it('reports a terminal full-preload failure and lets explicit load retry it', async () => {
    const target = new FakeVideoElement();
    const events = vi.fn<(event: VideoRendererEvent) => void>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('CORS blocked'))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));
    const { dependencies } = createFullPreloadDependencies(fetch);
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }], preload: 'full' }]),
      createHandle(target).handle,
      events,
      dependencies,
    );

    renderer.setResolution(resolveAt('intro', 1));
    await expect(renderer.whenReady()).rejects.toMatchObject({ code: 'FULL_PRELOAD_FAILED' });
    const errorEvent = events.mock.calls.find(([event]) => event.type === 'error')?.[0];
    expect(errorEvent?.type).toBe('error');

    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.code).toBe('FULL_PRELOAD_FAILED');
    }

    const loading = renderer.load();
    await vi.waitFor(() => {
      expect(target.getAttribute('src')).toMatch(/^blob:/);
    });
    target.emit('loadedmetadata');
    await loading;
    expect(fetch).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it('prepares responsive media changes transactionally and keeps target ownership stable', () => {
    const target = new FakeVideoElement();
    const viewportCallbacks: (() => void)[] = [];
    const observerStops: ReturnType<typeof vi.fn>[] = [];
    const observeNearViewport = vi.fn((_target, _rootMargin: string, onEnter: () => void) => {
      viewportCallbacks.push(onEnter);
      const stop = vi.fn();
      observerStops.push(stop);
      return stop;
    });
    const { dependencies } = createFullPreloadDependencies(vi.fn(), observeNearViewport);
    const base = compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }], {
      loading: { mode: 'on-demand', trigger: 'manual' },
    });
    const responsive = compileBinding(
      target,
      [{ id: 'detail', sources: [{ src: '/detail.mp4' }] }],
      {
        loading: {
          mode: 'on-demand',
          trigger: 'target-near-viewport',
          rootMargin: '300px',
        },
      },
    );
    const renderer = createNativeVideoRenderer(
      base,
      createHandle(target).handle,
      vi.fn(),
      dependencies,
    );

    const cancelled = renderer.prepareConfig(responsive);
    cancelled.cancel();
    cancelled.cancel();
    expect(observerStops[0]).toHaveBeenCalledOnce();
    renderer.setResolution(resolveAt('intro', 1));
    expect(target.getAttribute('src')).toBeNull();

    const committed = renderer.prepareConfig(responsive);
    viewportCallbacks[1]?.();
    committed.commit();
    committed.commit();
    committed.cancel();
    expect(target.getAttribute('src')).toBeNull();
    renderer.setResolution(resolveAt('detail', 2));

    expect(observeNearViewport).toHaveBeenLastCalledWith(target, '300px', expect.any(Function));
    expect(observerStops[1]).toHaveBeenCalledOnce();
    expect(target.getAttribute('src')).toBe('/detail.mp4');

    renderer.setActivity('disabled');
    renderer.setActivity('active');
    viewportCallbacks[2]?.();
    expect(observerStops[2]).toHaveBeenCalledOnce();

    const otherTarget = new FakeVideoElement();
    expect(() =>
      renderer.prepareConfig(
        compileBinding(otherTarget, [{ id: 'detail', sources: [{ src: '/detail.mp4' }] }]),
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_BREAKPOINT_CONFIG' }));
    renderer.destroy();
  });

  it('suspends frame work, disables media, and resumes the latest desired resolution', async () => {
    const target = new FakeVideoElement();
    const renderer = createNativeVideoRenderer(
      compileBinding(target, [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }]),
      createHandle(target).handle,
      vi.fn(),
    );

    renderer.setResolution(resolveAt('intro', 1));
    renderer.setActivity('suspended');
    renderer.setResolution(resolveAt('intro', 3));
    const loadCallsBeforeResume = target.loadCalls;
    target.duration = 10;
    target.emit('loadedmetadata');
    expect(target.seekAssignments).toEqual([]);

    renderer.setActivity('active');
    renderer.setActivity('active');
    expect(target.loadCalls).toBe(loadCallsBeforeResume);
    expect(target.seekAssignments).toEqual([3]);

    renderer.setActivity('disabled');
    expect(renderer.getState().loadState).toBe('unloaded');
    renderer.setResolution(resolveAt('intro', 5));
    await expect(renderer.load()).resolves.toBeUndefined();
    await expect(renderer.whenReady()).resolves.toBeUndefined();
    expect(target.getAttribute('src')).toBeNull();

    renderer.setActivity('active');
    renderer.setResolution(resolveAt('intro', 5));
    expect(target.getAttribute('src')).toBe('/intro.mp4');

    renderer.unload();
    renderer.setActivity('suspended');
    renderer.setActivity('active');
    expect(target.getAttribute('src')).toBeNull();
    renderer.destroy();
  });
});
