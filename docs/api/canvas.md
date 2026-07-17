# 2D canvas renderer

The optional canvas renderer uses an `HTMLVideoElement` as its decoder and copies decoded frames into a visible `HTMLCanvasElement`. It is useful for explicit cropping, a canvas-only presentation surface, and future composition work. Native video remains the smaller and more efficient default.

> [!IMPORTANT]
> Canvas adds a decoded-frame copy, bitmap sizing work, and additional CORS constraints. Prefer the root native-video entry unless the application specifically needs a canvas surface.

## Opt-in entry point

Canvas runtime code is available only from the dedicated entry point. The returned controller may combine video and canvas bindings:

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
              sources: [{ src: '/product.mp4', type: 'video/mp4' }],
              crossOrigin: 'anonymous',
              preload: 'auto',
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

The root `@frame-by-frame/core` factory remains video-only. Importing the canvas entry is the explicit choice that includes the adapter.

## Canvas and decoder ownership

A canvas binding requires `renderer: 'canvas'` and exactly one visible-target mode:

- `target` resolves an existing `HTMLCanvasElement`;
- `mountTo` resolves an `HTMLElement` where the package creates a canvas.

`controller.getTarget(id)` returns the visible canvas. A created canvas is removed during destruction; a supplied canvas is never removed and its CSS is not rewritten.

The package creates an owned, detached video decoder by default. Applications that already manage a decoder may provide it explicitly:

```ts
canvas: {
  decoderTarget: () => document.querySelector<HTMLVideoElement>('#decoder'),
}
```

Supplied decoders use the same best-effort property and attribute restoration as supplied native-video targets. Owned decoders are cleared and released. Active bindings cannot share a visible canvas or decoder video, including across controllers created from different package entry points.

## Fit modes

Every draw clears the bitmap and uses centered rectangles:

| Mode      | Behavior                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `contain` | Shows the complete frame with transparent letterboxing. This is default. |
| `cover`   | Fills the bitmap and crops the source evenly around its center.          |
| `fill`    | Fills both dimensions without preserving the source aspect ratio.        |
| `none`    | Uses intrinsic source dimensions in CSS pixels and centers the result.   |

Alignment, custom drawing callbacks, filters, overlays, pixel reads, WebGL, and WebGPU are outside the v1 canvas contract.

## CSS size and bitmap resolution

The application owns CSS layout. The renderer reads `clientWidth` and `clientHeight` during mount, `refresh()`, and coalesced resize work, then updates only the canvas `width` and `height` bitmap attributes.

`pixelRatio` accepts a finite positive number or `device`, which is the default. Device ratio produces a sharper bitmap but increases memory and copy work approximately with the number of pixels. A fixed value such as `1` is appropriate when predictable cost matters more than high-density output.

Zero-sized targets defer drawing until a later resize or manual `refresh()`. A resize redraws the latest decoded frame without submitting another media seek. No canvas measurement or drawing occurs in the raw scroll event handler.

## Loading and readiness

Canvas bindings reuse the native renderer's ordered sources, full-preload cache, on-demand triggers, latest-value-wins seek scheduling, frame snapping, and cleanup.

A canvas needs decoded pixels rather than metadata alone. For an activated canvas clip, public `preload: 'metadata'` is therefore advanced internally to first-renderable-data readiness without implying a full-file download. `load()` preserves the controller-wide contract and resolves at metadata. `whenReady()` additionally waits for the first required successful canvas draw.

`preload: 'none'` and on-demand work that has not been activated do not block `whenReady()`. Full preload still owns the complete fetched blob and may use substantial memory independently from the canvas bitmap and decoder buffers.

The public `frame` event is emitted only after `drawImage()` succeeds. A seek or loaded-data event provides a deterministic fallback for detached decoders; `requestVideoFrameCallback()` improves timing when the browser exposes it but is never the only canvas draw signal.

## Responsive behavior and preferences

Breakpoints may shallowly override `fit`, `pixelRatio`, and `imageSmoothingEnabled`. They cannot replace `decoderTarget`, the visible target, mount container, binding ID, axis, or renderer. Presentation-only changes redraw the current frame without reloading media.

Reduced-motion endpoint modes draw the selected first or last timeline frame. Disable mode releases media work while retaining the visible canvas element. Document visibility suspension keeps the last bitmap visible, pauses new seek/draw work, and synchronizes the latest desired frame after visibility returns.

## CORS and tainted canvases

Cross-origin video drawn to canvas requires a compatible clip `crossOrigin` value and server response. `crossOrigin: 'anonymous'` must be set before the source loads, and the media server must authorize the application origin.

A browser may allow drawing while marking the canvas as tainted. Taint prevents later pixel reads and exports such as `getImageData()` or `toBlob()`. The package does not expose those operations and cannot diagnose taint proactively without performing one. If the browser rejects `drawImage()` with `SecurityError`, the binding reports `CANVAS_SECURITY_ERROR`; other draw failures use `CANVAS_DRAW_FAILED`. A missing 2D context uses `CANVAS_CONTEXT_UNAVAILABLE`.

These failures stay on the affected binding and emit `error` without stopping unrelated bindings or the scroll controller.
