# frame-by-frame

A framework-agnostic TypeScript library for mapping scroll position to video time with responsive timelines, efficient scheduling, and explicit lifecycle control.

> [!IMPORTANT]
> This project is in early development. No package has been released and the public API is not ready for production use yet.

## Why frame-by-frame?

Scroll-driven video experiences often repeat the same difficult work: resolving the correct scroll source, mapping ranges, coordinating media seeks, handling responsive assets, and cleaning up browser resources. `frame-by-frame` aims to provide that behavior as a small, predictable engine instead of coupling it to one application or framework.

The planned npm package is `@frame-by-frame/core`.

The repository now contains the deterministic timeline and controller foundation, but the package remains private at version `0.0.0` until media rendering and a release process exist.

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
3. Add native video rendering and media loading.
4. Add responsive behavior, accessibility preferences, and canvas rendering.
5. Harden performance, documentation, tests, and release automation.
6. Release the core before adding framework examples.
7. Add `examples/vue` as the first framework example; React and other examples will be open to community pull requests.

Milestone details will be tracked through GitHub Issues as implementation begins.

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

Timeline easing acts as a default and can be overridden by each segment. Different clip IDs identify different media assets; alternate WebM/MP4 sources for one clip will be handled by the future media binding. Mapping does not imply loading, seamless decoder switching, or crossfading.

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
});

controller.on('update', ({ state }) => {
  const target = state.bindings.story?.resolution;
  // target?.clipId and target?.targetTime are ready for a renderer.
});

await controller.mount();
```

Controllers sharing a canonical scroll source also share one passive scroll listener and at most one pending animation frame. The raw scroll handler performs no metric reads; each animation frame distributes one scroll snapshot to every subscriber.

This foundation intentionally stops at mapping. It does not yet find a media target, load files, set `HTMLMediaElement.currentTime`, draw to canvas, or call `requestVideoFrameCallback()`. Those capabilities belong to the upcoming renderer work.

Read the [controller API reference](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/api/controller.md) for source resolution, lifecycle, state, events, errors, and scheduling behavior.

## Development

Use Node.js 24 LTS and pnpm 11 for local development. Node.js 22.18+ and 24.11+ are validated in CI.

```sh
pnpm install
pnpm check
```

Individual commands are available for formatting, linting, type checking, tests, coverage, and builds. The build emits ESM, TypeScript declarations, and source maps, then validates the package with publint and Are the Types Wrong.

Browser automation is intentionally not part of the current foundation. Browser integration suites will be added with the relevant runtime features.

See [ADR 0001](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0001-package-foundation.md) for package and toolchain decisions, [ADR 0002](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0002-timeline-mapping-contract.md) for the pure mapping contract, and [ADR 0003](https://github.com/mariozenmedina/frame-by-frame/blob/main/docs/decisions/0003-shared-scroll-controller.md) for source scheduling and lifecycle decisions.

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
