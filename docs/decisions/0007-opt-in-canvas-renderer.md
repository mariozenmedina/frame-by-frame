# ADR 0007: Opt-in video-backed canvas renderer

- Status: Accepted
- Date: 2026-07-16

## Context

Some scroll-driven experiences need explicit cropping or a canvas presentation surface, but canvas cannot decode video by itself. Including canvas behavior in the default controller would add frame-copy and sizing code to every consumer even though native video already provides the most efficient common path.

The renderer must reuse existing loading, cache, seeking, responsive, preference, and cleanup guarantees without creating another scroll scheduler or an independent media queue.

## Decision

The root `@frame-by-frame/core` factory remains video-only. `@frame-by-frame/core/canvas` exports a canvas-enabled `createFrameByFrame` that accepts mixed native-video and canvas bindings. This makes the runtime cost explicit and keeps the default entry graph free from the adapter.

A canvas binding has a visible `HTMLCanvasElement` target and a separate `HTMLVideoElement` decoder. Either target may be supplied where applicable; the package otherwise creates the canvas in `mountTo` and creates a detached decoder. Visible canvases and decoders have independent global ownership claims. `getTarget()` returns the visible surface, while decoder access remains private unless the application supplied its own reference.

The canvas config supports centered `contain`, `cover`, `fill`, and `none`, a fixed or device pixel ratio, and the 2D context smoothing flag. CSS layout remains application-owned. The renderer scales only bitmap dimensions, redraws the latest frame after resize without another seek, and performs no layout or draw work in the raw scroll handler.

The native video renderer remains the decoder pipeline. Activated metadata-only canvas clips advance to first-renderable data because metadata cannot produce pixels. Aggregate readiness includes the first required successful draw, while `load()` retains its metadata contract. Seek and loaded-data events guarantee a draw opportunity for detached decoders; video-frame callbacks are an optional precision improvement.

Breakpoint overrides may change presentation fields but cannot change canvas, decoder, or renderer ownership. Context and draw failures stay binding-scoped. Canvas taint is documented but not probed through a package-owned pixel read or export.

## Consequences

- Applications pay for canvas code only after importing the dedicated subpath.
- One canvas-enabled controller can coordinate native-video and canvas bindings.
- Canvas adds bitmap memory and a decoded-frame copy, especially at high device pixel ratios.
- The detached decoder avoids exposed markup but makes native composition callbacks optional rather than authoritative.
- Presentation-only breakpoint changes do not reload the decoder or reacquire targets.
- Custom composition and GPU renderers remain possible future additions without entering the v1 contract.

## Alternatives considered

Bundling canvas into the root factory was rejected because it weakens the opt-in boundary. Requiring an application-supplied decoder was rejected because it makes the common canvas setup unnecessarily complex. WebCodecs was rejected for v1 because it would require demuxing, encoded-chunk scheduling, codec configuration, and decoded-frame lifetime management that the native video element already provides.
