# Multi-clip timelines and easing

One binding can map different scroll intervals to different video clips and media-time intervals. Scroll coordinates and media time are separate domains: scroll may use pixels or normalized progress, while `media` always uses seconds.

```ts
import { createFrameByFrame } from '@frame-by-frame/core';

const controller = createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'chapter',
          target: '#chapter-video',
          clips: [
            {
              id: 'arrival',
              sources: [
                { src: '/arrival.webm', type: 'video/webm' },
                { src: '/arrival.mp4', type: 'video/mp4' },
              ],
            },
            {
              id: 'detail',
              sources: [{ src: '/detail.mp4', type: 'video/mp4' }],
            },
          ],
          easing: 'ease-in-out',
          segments: [
            {
              scroll: [0, 800],
              clip: 'arrival',
              media: [1.5, 7],
            },
            {
              scroll: [800, 1500],
              clip: 'detail',
              media: [12, 4],
              easing: 'linear',
            },
          ],
        },
      ],
    },
  },
});
```

The first segment maps scroll pixels `0..800` to seconds `1.5..7` of `arrival`. The second maps `800..1500` to seconds `12..4` of `detail`, so it plays in reverse. The binding-level easing is the default; a segment-level `easing` overrides it.

Custom easing functions receive normalized progress and must return a finite value between `0` and `1`:

```ts
easing: (progress) => progress * progress,
```

Adjacent segments share their boundary deterministically. A gap holds the preceding segment's endpoint. Switching clip IDs changes the selected source on the same target; it is not a crossfade and seamless presentation still depends on media encoding and browser decoder behavior. Use separate targets for simultaneous clips or composition.

Frame snapping is optional and uses an explicitly supplied rate:

```ts
frame: { snap: true, fps: 30 },
```

This quantizes requested media time; it cannot guarantee exact visual frame presentation for every codec and browser. See the [timeline reference](../api/timeline.md) and [media preparation guide](../guides/media-preparation.md).
