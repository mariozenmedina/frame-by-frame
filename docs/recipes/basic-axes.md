# Vertical, horizontal, and simultaneous axes

A controller can observe the document or one custom scroll container. Its `x` and `y` axes are independent, and each binding owns its own timeline and media target.

## Vertical document scrolling

Omit `source` to observe the document scrolling element after mount:

```ts
import { createFrameByFrame } from '@frame-by-frame/core';

const controller = createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'vertical-story',
          target: '#vertical-video',
          clips: [{ id: 'story', sources: [{ src: '/story.mp4' }] }],
          segments: [{ scroll: [0, 1200], clip: 'story', media: [0, 9] }],
        },
      ],
    },
  },
});

await controller.mount();
```

Pixel coordinates are the default. The media interval is always measured in seconds.

## Horizontal custom scrolling

Set `source` to an element, selector, or resolver and configure only `x`:

```ts
const controller = createFrameByFrame({
  source: '#horizontal-scroller',
  axes: {
    x: {
      bindings: [
        {
          id: 'horizontal-story',
          target: '#horizontal-video',
          clips: [{ id: 'pan', sources: [{ src: '/pan.mp4' }] }],
          segments: [
            {
              scroll: [0, 1],
              scrollUnit: 'progress',
              clip: 'pan',
              media: [0, 6],
            },
          ],
        },
      ],
    },
  },
});
```

Progress coordinates are normalized from `0` to `1` using the current scrollable range. Call `refresh()` after application-owned layout changes that affect that range.

## Both axes at once

Define both axes when one source should drive separate targets:

```ts
const controller = createFrameByFrame({
  source: '#two-axis-scroller',
  axes: {
    x: {
      bindings: [
        {
          id: 'product-spin',
          target: '#spin-video',
          clips: [{ id: 'spin', sources: [{ src: '/spin.mp4' }] }],
          segments: [{ scroll: [0, 1], scrollUnit: 'progress', clip: 'spin', media: [0, 5] }],
        },
      ],
    },
    y: {
      bindings: [
        {
          id: 'product-detail',
          target: '#detail-video',
          clips: [{ id: 'detail', sources: [{ src: '/detail.mp4' }] }],
          segments: [{ scroll: [0, 1], scrollUnit: 'progress', clip: 'detail', media: [2, 10] }],
        },
      ],
    },
  },
});
```

Binding IDs must be unique across the controller. Axes may be disabled independently, and one controller still uses one coalesced scroll snapshot per animation frame. See the [controller reference](../api/controller.md) for scheduling and source metrics.
