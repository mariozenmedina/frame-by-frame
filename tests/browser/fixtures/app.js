/* global HTMLCanvasElement, HTMLElement, HTMLVideoElement, document, requestAnimationFrame, window */

import { createFrameByFrame as createVideoController } from '/dist/index.js';
import { createFrameByFrame as createCanvasController } from '/dist/canvas.js';

const mediaDirectory = '/tests/browser/fixtures/media';
const controllers = new Map();
const activeObjectUrls = new Set();
const metrics = {
  fetches: 0,
  abortSignals: 0,
  objectUrlsCreated: 0,
  objectUrlsRevoked: 0,
  scrollListenerAdds: 0,
  scrollListenerRemoves: 0,
  updates: [],
  frames: 0,
  loadProgressEvents: 0,
  errors: [],
};

const browserFetch = window.fetch.bind(window);
const browserCreateObjectUrl = window.URL.createObjectURL.bind(window.URL);
const browserRevokeObjectUrl = window.URL.revokeObjectURL.bind(window.URL);

window.fetch = (input, init) => {
  metrics.fetches += 1;
  init?.signal?.addEventListener(
    'abort',
    () => {
      metrics.abortSignals += 1;
    },
    { once: true },
  );
  return browserFetch(input, init);
};

window.URL.createObjectURL = (object) => {
  const url = browserCreateObjectUrl(object);
  metrics.objectUrlsCreated += 1;
  activeObjectUrls.add(url);
  return url;
};

window.URL.revokeObjectURL = (url) => {
  metrics.objectUrlsRevoked += 1;
  activeObjectUrls.delete(url);
  browserRevokeObjectUrl(url);
};

const instrumentScrollTarget = (target) => {
  const addEventListener = target.addEventListener.bind(target);
  const removeEventListener = target.removeEventListener.bind(target);

  target.addEventListener = (type, listener, options) => {
    if (type === 'scroll') {
      metrics.scrollListenerAdds += 1;
    }
    addEventListener(type, listener, options);
  };
  target.removeEventListener = (type, listener, options) => {
    if (type === 'scroll') {
      metrics.scrollListenerRemoves += 1;
    }
    removeEventListener(type, listener, options);
  };
};

const scroller = document.querySelector('#custom-scroller');

if (!(scroller instanceof HTMLElement)) {
  throw new Error('The custom browser fixture scroller is missing.');
}

instrumentScrollTarget(document);
instrumentScrollTarget(scroller);

const settle = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

const primaryClip = ({ preload = 'metadata', slow = false } = {}) => {
  const query = slow ? '?slow=1' : '';

  return {
    id: 'primary',
    preload,
    sources: [
      { src: '/tests/browser/fixtures/media/unsupported.bin', type: 'video/x-invalid' },
      {
        src: `${mediaDirectory}/primary.mp4${query}`,
        type: 'video/mp4; codecs="avc1.42C00A"',
      },
      { src: `${mediaDirectory}/primary.webm${query}`, type: 'video/webm; codecs="vp8"' },
    ],
  };
};

const accentClip = () => ({
  id: 'accent',
  sources: [
    { src: `${mediaDirectory}/accent.mp4`, type: 'video/mp4; codecs="avc1.42C00A"' },
    { src: `${mediaDirectory}/accent.webm`, type: 'video/webm; codecs="vp8"' },
  ],
});

const segment = (clip = 'primary', media = [0, 0.4]) => ({
  scroll: [0, 1],
  scrollUnit: 'progress',
  clip,
  media,
});

const binding = ({
  id,
  target,
  clips = [primaryClip()],
  segments = [segment()],
  loading,
  renderer,
  canvas,
}) => ({
  id,
  target,
  clips,
  segments,
  ...(loading === undefined ? {} : { loading }),
  ...(renderer === undefined ? {} : { renderer }),
  ...(canvas === undefined ? {} : { canvas }),
});

const scenarioConfig = (scenario) => {
  switch (scenario) {
    case 'document':
      return {
        options: {
          axes: {
            y: { bindings: [binding({ id: 'document', target: '#document-video' })] },
          },
        },
      };
    case 'custom-x':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            x: { bindings: [binding({ id: 'custom-x', target: '#custom-x-video' })] },
          },
        },
      };
    case 'simultaneous':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            x: { bindings: [binding({ id: 'custom-x', target: '#custom-x-video' })] },
            y: { bindings: [binding({ id: 'custom-y', target: '#custom-y-video' })] },
          },
        },
      };
    case 'multi-clip':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            y: {
              bindings: [
                binding({
                  id: 'multi-clip',
                  target: '#custom-y-video',
                  clips: [primaryClip(), accentClip()],
                  segments: [
                    { scroll: [0, 0.5], scrollUnit: 'progress', clip: 'primary', media: [0, 0.4] },
                    {
                      scroll: [0.5, 1],
                      scrollUnit: 'progress',
                      clip: 'accent',
                      media: [0.2, 0],
                      easing: 'linear',
                    },
                  ],
                }),
              ],
            },
          },
        },
      };
    case 'manual':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            y: {
              bindings: [
                binding({
                  id: 'manual',
                  target: '#loading-video',
                  loading: { mode: 'on-demand', trigger: 'manual' },
                }),
              ],
            },
          },
        },
      };
    case 'first-use':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            y: {
              bindings: [
                binding({
                  id: 'first-use',
                  target: '#loading-video',
                  loading: { mode: 'on-demand', trigger: 'first-use' },
                }),
              ],
            },
          },
        },
      };
    case 'viewport':
      return {
        options: {
          axes: {
            y: {
              bindings: [
                binding({
                  id: 'viewport',
                  target: '#viewport-video',
                  loading: {
                    mode: 'on-demand',
                    trigger: 'target-near-viewport',
                    rootMargin: '0px',
                  },
                }),
              ],
            },
          },
        },
      };
    case 'full':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            y: {
              bindings: [
                binding({
                  id: 'full',
                  target: '#loading-video',
                  clips: [primaryClip({ preload: 'full' })],
                }),
              ],
            },
          },
        },
      };
    case 'full-abort':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            y: {
              bindings: [
                binding({
                  id: 'full-abort',
                  target: '#loading-video',
                  clips: [primaryClip({ preload: 'full', slow: true })],
                }),
              ],
            },
          },
        },
      };
    case 'responsive':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            y: {
              bindings: [binding({ id: 'responsive', target: '#responsive-video' })],
            },
          },
          breakpoints: [
            {
              id: 'compact',
              query: '(max-width: 600px)',
              override: {
                axes: {
                  y: {
                    bindings: [
                      {
                        id: 'responsive',
                        clips: [accentClip()],
                        segments: [segment('accent', [0, 0.2])],
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      };
    case 'reduced-motion':
      return {
        options: {
          axes: {
            y: { bindings: [binding({ id: 'reduced', target: '#reduced-video' })] },
          },
          reducedMotion: 'first-frame',
        },
      };
    case 'canvas':
      return {
        canvas: true,
        options: {
          source: '#custom-scroller',
          axes: {
            y: {
              bindings: [
                binding({
                  id: 'canvas',
                  target: '#canvas-target',
                  renderer: 'canvas',
                  canvas: { fit: 'cover', pixelRatio: 1 },
                }),
              ],
            },
          },
        },
      };
    case 'lifecycle':
      return {
        options: {
          source: '#custom-scroller',
          axes: {
            y: { bindings: [binding({ id: 'lifecycle', target: '#loading-video' })] },
          },
        },
      };
    default:
      throw new Error(`Unknown browser fixture scenario: ${scenario}`);
  }
};

const snapshot = (controller) => {
  const state = controller.getState();

  return {
    status: state.status,
    enabled: state.enabled,
    sourceNodeType: state.source?.nodeType ?? null,
    activeBreakpoints: [...state.activeBreakpoints],
    prefersReducedMotion: state.prefersReducedMotion,
    axes: Object.fromEntries(Object.entries(state.axes).map(([name, axis]) => [name, { ...axis }])),
    bindings: Object.fromEntries(
      Object.entries(state.bindings).map(([id, current]) => [
        id,
        {
          id: current.id,
          axis: current.axis,
          renderer: current.renderer,
          loadState: current.loadState,
          activeClipId: current.activeClipId,
          selectedSource: current.selectedSource,
          duration: current.duration,
          appliedTime: current.appliedTime,
          presentedTime: current.presentedTime,
          seeking: current.seeking,
          errorCode: current.error?.code ?? null,
          resolution:
            current.resolution === null
              ? null
              : {
                  phase: current.resolution.phase,
                  clipId: current.resolution.clipId,
                  requestedTime: current.resolution.requestedTime,
                  targetTime: current.resolution.targetTime,
                },
        },
      ]),
    ),
  };
};

const primaryController = () => {
  const controller = controllers.get('primary');

  if (controller === undefined) {
    throw new Error('The primary browser fixture controller has not been mounted.');
  }

  return controller;
};

const setup = async (scenario) => {
  window.scrollTo(0, 0);
  scroller.scrollTo(0, 0);
  await settle();

  const config = scenarioConfig(scenario);
  const factory = config.canvas === true ? createCanvasController : createVideoController;
  const controller = factory(config.options);
  controller.on('update', ({ reason }) => metrics.updates.push(reason));
  controller.on('frame', () => {
    metrics.frames += 1;
  });
  controller.on('loadprogress', () => {
    metrics.loadProgressEvents += 1;
  });
  controller.on('error', (error) => {
    metrics.errors.push({ code: error.code, message: error.message });
  });
  controllers.set('primary', controller);
  await controller.mount();
  return snapshot(controller);
};

window.frameByFrameFixture = {
  setup,
  ready: async () => {
    const controller = primaryController();
    await controller.whenReady();
    return snapshot(controller);
  },
  state: () => snapshot(primaryController()),
  load: async () => {
    const controller = primaryController();
    await controller.load();
    return snapshot(controller);
  },
  unload: () => {
    const controller = primaryController();
    controller.unload();
    return snapshot(controller);
  },
  enable: () => {
    const controller = primaryController();
    controller.enable();
    return snapshot(controller);
  },
  disable: () => {
    const controller = primaryController();
    controller.disable();
    return snapshot(controller);
  },
  refresh: () => {
    const controller = primaryController();
    controller.refresh();
    return snapshot(controller);
  },
  destroy: () => {
    const controller = primaryController();
    controller.destroy();
    return snapshot(controller);
  },
  scrollDocument: async (progress) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max * progress);
    await settle();
  },
  scrollSource: async (xProgress, yProgress) => {
    const maxX = scroller.scrollWidth - scroller.clientWidth;
    const maxY = scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTo(maxX * xProgress, maxY * yProgress);
    await settle();
  },
  revealViewportTarget: async () => {
    document.querySelector('#viewport-video')?.scrollIntoView({ block: 'center' });
    await settle();
  },
  target: (selector) => {
    const target = document.querySelector(selector);

    if (!(target instanceof HTMLVideoElement)) {
      throw new Error(`Expected a video fixture target for ${selector}.`);
    }

    return {
      currentTime: target.currentTime,
      duration: Number.isFinite(target.duration) ? target.duration : null,
      readyState: target.readyState,
      preload: target.preload,
      src: target.src,
      hasSourceAttribute: target.hasAttribute('src'),
    };
  },
  canvas: () => {
    const target = document.querySelector('#canvas-target');

    if (!(target instanceof HTMLCanvasElement)) {
      throw new Error('Expected the canvas fixture target.');
    }

    const context = target.getContext('2d');
    const sampleWidth = Math.min(target.width, 20);
    const sampleHeight = Math.min(target.height, 20);
    const pixels = context?.getImageData(0, 0, sampleWidth, sampleHeight).data ?? [];
    const nonTransparentPixels = Array.from(pixels).filter(
      (value, index) => index % 4 === 3 && value > 0,
    ).length;

    return {
      width: target.width,
      height: target.height,
      clientWidth: target.clientWidth,
      clientHeight: target.clientHeight,
      nonTransparentPixels,
    };
  },
  setCanvasCssWidth: (width) => {
    const target = document.querySelector('#canvas-target');

    if (!(target instanceof HTMLCanvasElement)) {
      throw new Error('Expected the canvas fixture target.');
    }

    target.style.width = `${width}px`;
  },
  metrics: () => ({
    ...metrics,
    updates: [...metrics.updates],
    errors: [...metrics.errors],
    activeObjectUrls: activeObjectUrls.size,
  }),
  settle,
};
