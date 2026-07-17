# Opt-in canvas rendering

Native video is the smaller and more efficient default. Use the canvas entry only when the visible output needs canvas-specific fitting, cropping, or composition boundaries.

```ts
import { createFrameByFrame } from '@frame-by-frame/core/canvas';

const controller = createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'product',
          renderer: 'canvas',
          target: '#product-canvas',
          clips: [
            {
              id: 'turntable',
              sources: [{ src: '/turntable.mp4', type: 'video/mp4' }],
            },
          ],
          canvas: {
            fit: 'cover',
            pixelRatio: 'device',
            imageSmoothingEnabled: true,
          },
          segments: [
            {
              scroll: [0, 1],
              scrollUnit: 'progress',
              clip: 'turntable',
              media: [0, 8],
            },
          ],
        },
      ],
    },
  },
});

await controller.mount();
await controller.whenReady();
```

The package creates an internal detached video decoder unless `canvas.decoderTarget` identifies an existing video. The application owns the visible canvas CSS size; the renderer maintains its bitmap size and draws with `contain`, `cover`, `fill`, or `none` fitting.

Choose canvas deliberately:

- decoded frames must be copied into a 2D context;
- device pixel ratio can substantially increase bitmap memory and drawing work;
- cross-origin media must permit canvas pixel access;
- a canvas needs an accessible alternative because its pixels do not describe content to assistive technology.

Use a numeric `pixelRatio` to cap bitmap density when the device value is unnecessarily expensive. Presentation-only breakpoint changes redraw without a new media load. Read the [canvas API reference](../api/canvas.md), [performance guide](../guides/performance.md), and [accessibility guide](../guides/accessibility.md) before selecting this renderer.
