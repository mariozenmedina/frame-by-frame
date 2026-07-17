# Performance

`frame-by-frame` bounds scheduling work, but media decoding, transfer size, DOM layout, and canvas drawing remain application and browser costs. Measure the complete experience with production-like assets.

## Start with native video

Use the root video-only entry unless canvas-specific presentation is required. Native video avoids copying every presented frame into a 2D bitmap. The repository also verifies that canvas implementation code stays outside the root and explicit-video module graphs.

Current gzip budgets are enforced by `pnpm check:bundle`:

- root runtime graph: at most 30 KiB;
- incremental canvas graph: at most 8 KiB.

These are regression budgets, not transfer-size promises for a future published version.

## Loading and memory

- `metadata` is the default native hint and is a reasonable starting point.
- `full` fetches complete assets into reference-counted blobs; use it only when its deterministic availability is worth transfer and memory cost.
- Viewport, manual, and first-use triggers defer work but may expose a wait at activation.
- Responsive replacement does not guarantee a smaller transfer if the previous asset was already loaded.
- Call `unload()` for deliberately dormant media and `destroy()` when the experience ends.

## Scroll and seek work

The controller uses passive scroll listeners and one pending `requestAnimationFrame` per canonical source. Rapid input keeps only the latest pending media target. A small `seek.timeEpsilon` suppresses meaningless duplicate seeks; increase it only when a coarser visual response is acceptable.

Avoid application listeners that perform layout writes on every `update`. When UI does not need controller state, do not mirror it into a reactive store.

## Canvas cost

Canvas bitmap memory and draw cost grow with width, height, and pixel ratio. Prefer a bounded numeric `pixelRatio` over `'device'` on large surfaces when the visual difference is negligible. Resize the CSS layout in application code, then call `refresh()` when automatic observation cannot see the relevant change.

## Measure the application

Profile with representative devices, assets, network conditions, scroll patterns, and surrounding application work. Inspect long tasks, layout, decoder behavior, memory, transferred bytes, and frame presentation. The repository uses deterministic operation-count tests rather than machine-specific timing or FPS thresholds; real-browser evidence remains a separate operator task.
