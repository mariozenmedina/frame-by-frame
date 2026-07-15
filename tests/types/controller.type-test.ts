import { createFrameByFrame } from '../../src/index.js';

import type {
  FrameByFrameController,
  FrameByFrameBreakpointChangeEvent,
  FrameByFrameState,
  FrameByFrameUpdateEvent,
} from '../../src/types.js';

export const verifyControllerTypes = (element: HTMLElement): void => {
  const controller: FrameByFrameController = createFrameByFrame({
    source: () => element,
    axes: {
      y: {
        bindings: [
          {
            id: 'intro',
            target: element as unknown as HTMLVideoElement,
            clips: [{ id: 'intro-video', sources: [{ src: '/intro.mp4' }], preload: 'full' }],
            loading: {
              mode: 'on-demand',
              trigger: 'target-near-viewport',
              rootMargin: '500px 0px',
              credentials: 'same-origin',
            },
            easing: 'ease-in-out',
            segments: [
              {
                clip: 'intro-video',
                media: [2, 8],
                scroll: [0, 1],
                scrollUnit: 'progress',
              },
            ],
          },
        ],
      },
    },
    reducedMotion: 'last-frame',
    breakpoints: [
      {
        id: 'compact',
        query: '(max-width: 640px)',
        override: {
          axes: {
            y: {
              bindings: [
                {
                  id: 'intro',
                  video: { controls: false },
                  segments: [
                    {
                      clip: 'intro-video',
                      media: [2, 5],
                      scroll: [0, 1],
                      scrollUnit: 'progress',
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    ],
  });

  controller.on('update', (event: FrameByFrameUpdateEvent) => {
    const state: FrameByFrameState = event.state;
    void state;
  });
  controller.on('frame', ({ bindingId, presentedTime }) => {
    const id: string = bindingId;
    const time: number = presentedTime;
    void id;
    void time;
  });
  controller.on('breakpointchange', (event: FrameByFrameBreakpointChangeEvent) => {
    const previous: readonly string[] = event.previous;
    const current: readonly string[] = event.current;
    void previous;
    void current;
  });

  void controller.load('intro');
  void controller.whenReady();
  controller.unload('intro');
  const target: HTMLVideoElement | null = controller.getTarget('intro');
  void target;

  const state = controller.getState();

  const ratio: number | null | undefined =
    state.bindings['intro']?.loadProgress['intro-video']?.ratio;
  void ratio;

  // @ts-expect-error: State snapshots are readonly.
  state.status = 'ready';

  // @ts-expect-error: Binding snapshots are readonly.
  state.bindings['intro'] = { id: 'other', axis: 'x', resolution: null };

  const introState = state.bindings['intro'];

  if (introState !== undefined) {
    // @ts-expect-error: Progress snapshots are readonly.
    introState.loadProgress['intro-video'] = {
      loadedBytes: 0,
      totalBytes: null,
      ratio: null,
    };
  }

  createFrameByFrame({
    axes: {
      y: {
        bindings: [
          {
            id: 'invalid',
            target: element as unknown as HTMLVideoElement,
            clips: [{ id: 'invalid-video', sources: [{ src: '/invalid.mp4' }] }],
            segments: [
              {
                media: [0, 1],
                scroll: [0, 1],
                // @ts-expect-error: Controller timelines use the same strict scroll units.
                scrollUnit: 'percent',
              },
            ],
          },
        ],
      },
    },
  });

  createFrameByFrame({
    axes: { y: { bindings: [] as never } },
    breakpoints: [
      {
        id: 'invalid-target',
        query: '(max-width: 1px)',
        override: {
          axes: {
            y: {
              bindings: [
                {
                  id: 'intro',
                  // @ts-expect-error: Responsive overrides cannot replace targets.
                  target: element as HTMLVideoElement,
                },
              ],
            },
          },
        },
      },
    ],
  });
};
