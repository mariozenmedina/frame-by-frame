# frame-by-frame

A framework-agnostic TypeScript library for mapping scroll position to video time with responsive timelines, efficient scheduling, and explicit lifecycle control.

> [!IMPORTANT]
> This project is in early development. No package has been released and the public API is not ready for production use yet.

## Why frame-by-frame?

Scroll-driven video experiences often repeat the same difficult work: resolving the correct scroll source, mapping ranges, coordinating media seeks, handling responsive assets, and cleaning up browser resources. `frame-by-frame` aims to provide that behavior as a small, predictable engine instead of coupling it to one application or framework.

The planned npm package is `@frame-by-frame/core`.

The repository now contains the deterministic timeline, shared scroll controller, native video and opt-in 2D canvas renderers, advanced media loading, responsive overrides, and reduced-motion behavior. The package remains private at version `0.0.0` while v1 hardening and the release process are built.

## Design principles

- **Framework agnostic:** the core uses browser APIs and an explicit lifecycle.
- **SSR-safe imports:** browser globals are resolved only when a controller is mounted.
- **Native first:** `HTMLVideoElement` is the default decoder and renderer.
- **Canvas when needed:** a video-backed 2D canvas renderer is optional.
- **Deterministic mapping:** horizontal and vertical timelines remain independent.
- **Bounded work:** scroll events are coalesced and obsolete seeks do not accumulate.
- **Complete ownership:** listeners, observers, requests, object URLs, and created elements are released on teardown.
- **Accessible defaults:** reduced-motion preferences are respected and native scrolling is never hijacked.

## Planned v1 scope

- Document and custom-element scroll sources.
- Independent horizontal and vertical axes.
- Pixel and normalized-progress scroll segments.
- Multiple media clips within one timeline.
- Forward and reverse media-time ranges with easing and optional frame snapping.
- Responsive overrides driven by CSS media queries.
- Native, full-file, and on-demand loading strategies.
- Native video and optional video-backed canvas renderers.
- Shared scheduling, passive listeners, and animation-frame coalescing.
- Typed state, events, errors, and lifecycle methods.
- Strict TypeScript declarations and framework-independent runtime code.

`frame-by-frame` is not intended to be a general-purpose video player, encoder, streaming implementation, scroll hijacker, or guarantee of exact frame presentation for every codec and source file.

## Roadmap

Development is intentionally incremental:

1. Establish the public contract and deterministic mapping engine.
2. Implement source observation, scheduling, and controller lifecycle.
3. Add native video rendering, full/on-demand loading, and aggregate readiness. **Completed.**
4. Add responsive behavior, accessibility preferences, and canvas rendering. **Completed.**
5. Harden performance, documentation, tests, and release automation. **Current stage.**
6. Release the core before adding framework examples.
7. Add `examples/vue` as the first framework example; React and other examples will be open to community pull requests.

Milestone details will be tracked through GitHub Issues as implementation begins.

The [version 1 acceptance matrix](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/v1-acceptance.md) separates automated evidence from operator browser validation and release work that is still pending.

## Timeline mapping

The first implemented runtime capability is a pure, SSR-safe timeline engine. It resolves a scroll coordinate to a clip ID and media time without reading the DOM or loading media.

```ts
import { createTimeline } from '@frame-by-frame/core';

const timeline = createTimeline({
  easing: 'ease-in-out',
  segments: [
    { scroll: [0, 100], clip: 'intro', media: [0, 5] },
    { scroll: [100, 250], clip: 'detail', media: [12, 6], easing: 'linear' },
  ],
});

const result = timeline.resolve(150);
// result.clipId === 'detail'
// result.requestedTime === 10
```

Timeline easing acts as a default and can be overridden by each segment. Different clip IDs identify different media assets; each clip may provide ordered WebM/MP4 source candidates. Mapping alone does not imply loading, seamless decoder switching, or crossfading.

Read the [timeline API reference](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/api/timeline.md) for boundaries, gaps, easing, frame snapping, errors, and multi-clip behavior.

## Controller foundation

`createFrameByFrame()` connects one or both scroll axes to named timelines. Browser sources are resolved only by `mount()`, so importing the package and creating a controller remain safe during SSR.

```ts
import { createFrameByFrame } from '@frame-by-frame/core';

const controller = createFrameByFrame({
  source: () => document.querySelector<HTMLElement>('#story-scroll'),
  axes: {
    y: {
      bindings: [
        {
          id: 'story',
          target: () => document.querySelector<HTMLVideoElement>('#story-video'),
          clips: [
            {
              id: 'intro',
              sources: [
                { src: '/video/intro.webm', type: 'video/webm' },
                { src: '/video/intro.mp4', type: 'video/mp4' },
              ],
            },
            {
              id: 'detail',
              sources: [{ src: '/video/detail.mp4', type: 'video/mp4' }],
            },
          ],
          easing: 'ease-in-out',
          segments: [
            {
              scroll: [0, 0.5],
              scrollUnit: 'progress',
              clip: 'intro',
              media: [0, 6],
            },
            {
              scroll: [0.5, 1],
              scrollUnit: 'progress',
              clip: 'detail',
              media: [12, 4],
            },
          ],
        },
      ],
    },
  },
  reducedMotion: 'first-frame',
  breakpoints: [
    {
      id: 'compact',
      query: '(max-width: 640px)',
      override: {
        axes: {
          y: {
            bindings: [
              {
                id: 'story',
                segments: [
                  {
                    scroll: [0, 1],
                    scrollUnit: 'progress',
                    clip: 'intro',
                    media: [0, 4],
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

controller.on('update', ({ state }) => {
  console.log(state.bindings.story?.resolution);
});

controller.on('frame', ({ clipId, presentedTime }) => {
  console.log(clipId, presentedTime);
});

await controller.mount();
await controller.whenReady(); // useful for an application loading screen
```

Controllers sharing a canonical scroll source also share one passive scroll listener and at most one pending animation frame. The raw scroll handler performs no metric reads; each animation frame distributes one scroll snapshot to every subscriber.

The native renderer resolves or creates one `HTMLVideoElement` per binding, selects ordered source candidates, and writes precise `currentTime` seeks. It supports native hints, explicit full-file preload with a shared reference-counted cache, and manual, viewport, or first-use activation. `whenReady()` provides one aggregate Promise for loading-screen orchestration, while `loadprogress` exposes byte progress when available. Ordered media-query overrides can replace timelines and media options without replacing mounted targets. Reduced-motion preferences default to pinning the first frame and can instead pin the last frame, disable media work, or be explicitly ignored. While a seek is in flight, only the latest pending target is retained. When available, `requestVideoFrameCallback()` reports the composed frame; other browsers use native media events as an approximation.

The root import is recommended. `@frame-by-frame/core/video` exposes the same video-only API as an explicit renderer-named alias; canvas bindings remain available only through `@frame-by-frame/core/canvas`.

Read the [controller API reference](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/api/controller.md) for source resolution, lifecycle, state, events, errors, and scheduling behavior, and the [native video guide](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/api/video.md) for targets, clips, loading, seeking, and cleanup.

## Optional canvas rendering

Canvas support is opt-in so the default package entry stays focused on native video. Import the canvas-enabled factory when a binding needs explicit cropping or a canvas presentation surface:

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
          clips: [{ id: 'turntable', sources: [{ src: '/product.mp4' }] }],
          canvas: { fit: 'cover', pixelRatio: 'device' },
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

The package creates a detached video decoder unless `canvas.decoderTarget` is supplied. It supports centered `contain`, `cover`, `fill`, and `none`, device-aware bitmap sizing, resize redraw without a new seek, and the existing loading and breakpoint policies. Canvas adds frame-copy, memory, and CORS costs; read the [2D canvas guide](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/api/canvas.md) before choosing it over native video.

## Development

Use Node.js 24 LTS and pnpm 11 for local development. Node.js 22.18+ and 24.11+ are validated in CI.

```sh
pnpm install
pnpm check
```

Individual commands are available for formatting, linting, type checking, tests, coverage, builds, and bundle auditing. The build emits ESM, TypeScript declarations, and source maps, then validates the package with publint and Are the Types Wrong. `pnpm check:bundle` follows emitted imports, enforces the root and incremental-canvas gzip budgets, and verifies that canvas implementation code stays outside the root and explicit video graphs.

Native media behavior is covered with deterministic structural fakes in Node. Performance-sensitive tests assert bounded operation counts for scroll bursts, seeks, and canvas draws instead of machine-specific elapsed time. Browser validation remains a manual operator step because codec, decoder, and frame-presentation behavior varies by runtime and media asset.

See [ADR 0001](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0001-package-foundation.md) for package and toolchain decisions, [ADR 0002](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0002-timeline-mapping-contract.md) for the pure mapping contract, [ADR 0003](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0003-shared-scroll-controller.md) for source scheduling and lifecycle decisions, [ADR 0004](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0004-native-video-renderer.md) for native media ownership and seek scheduling, [ADR 0005](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0005-advanced-media-loading.md) for loading and cache ownership, [ADR 0006](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0006-responsive-preferences.md) for responsive overrides, reduced motion, resize, and visibility, [ADR 0007](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0007-opt-in-canvas-renderer.md) for the optional video-backed canvas boundary, [ADR 0008](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0008-v1-contract-hardening.md) for the frozen v1 surface and package-entry contract, and [ADR 0009](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0009-performance-and-supply-chain-gates.md) for deterministic performance, bundle, and repository security gates.

## Contributing

The project welcomes focused bug reports, design feedback, documentation improvements, and implementation proposals. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

Large API or architecture changes should begin as an issue so the direction can be agreed before implementation. Public project communication is kept in English.

## Community and support

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.
- Use the issue forms for reproducible bugs and feature proposals.
- Read [SUPPORT.md](SUPPORT.md) for usage and project questions.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- See [GOVERNANCE.md](GOVERNANCE.md) for the decision-making model.

## License

Licensed under the [MIT License](LICENSE).
