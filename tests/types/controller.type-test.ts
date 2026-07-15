import { createFrameByFrame } from '../../src/index.js';

import type {
  FrameByFrameController,
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
  });

  controller.on('update', (event: FrameByFrameUpdateEvent) => {
    const state: FrameByFrameState = event.state;
    void state;
  });

  const state = controller.getState();

  // @ts-expect-error: State snapshots are readonly.
  state.status = 'ready';

  // @ts-expect-error: Binding snapshots are readonly.
  state.bindings['intro'] = { id: 'other', axis: 'x', resolution: null };

  createFrameByFrame({
    axes: {
      y: {
        bindings: [
          {
            id: 'invalid',
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
};
