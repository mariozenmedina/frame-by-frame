# frame-by-frame

[![CI](https://github.com/mariozenmedina/frame-by-frame/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mariozenmedina/frame-by-frame/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A framework-agnostic TypeScript engine for mapping scroll position to video time.

> [!IMPORTANT]
> `frame-by-frame` is unreleased and not ready for production use. The package remains private at version `0.0.0` while browser validation and release automation are completed.

## Why frame-by-frame?

Scroll-driven video experiences repeatedly need the same careful behavior: deterministic timeline mapping, bounded media seeks, responsive assets, loading coordination, and complete cleanup. `frame-by-frame` provides those responsibilities as a small engine with an explicit lifecycle instead of coupling them to an application or frontend framework.

- Map pixel or normalized scroll ranges to forward or reverse media-time ranges.
- Use multiple clips and global or per-segment easing in one timeline.
- Drive independent horizontal and vertical targets from one controller.
- Choose native video by default or opt into a video-backed 2D canvas.
- Coordinate immediate, full-file, manual, viewport, and first-use loading.
- Respect reduced-motion preferences and apply ordered responsive overrides.
- Keep imports SSR-safe and release every owned resource with `destroy()`.

Native scrolling is never intercepted. The engine coalesces scroll work with animation frames and keeps only the latest pending seek.

## Quick start

The planned package name is `@frame-by-frame/core`. This import demonstrates the intended package contract; it is not available from npm yet.

```ts
import { createFrameByFrame } from '@frame-by-frame/core';

const controller = createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'story',
          target: '#story-video',
          clips: [
            {
              id: 'intro',
              sources: [
                { src: '/media/intro.webm', type: 'video/webm' },
                { src: '/media/intro.mp4', type: 'video/mp4' },
              ],
            },
          ],
          easing: 'ease-in-out',
          segments: [
            {
              scroll: [0, 1],
              scrollUnit: 'progress',
              clip: 'intro',
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

// On application teardown:
controller.destroy();
```

`mount()` resolves DOM ownership and starts configured automatic loading without waiting for the network. `whenReady()` is the aggregate readiness barrier for application loading screens.

## Package entries

| Entry                         | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `@frame-by-frame/core`        | Recommended video-only controller, timeline, errors, and types |
| `@frame-by-frame/core/video`  | Explicit alias for the same video-only API                     |
| `@frame-by-frame/core/canvas` | Opt-in factory supporting video and canvas bindings            |
| `@frame-by-frame/core/types`  | Runtime-empty, type-only entry                                 |

## Documentation

Start with the [documentation map](docs/README.md), then choose the path that matches your task:

- [Recipes](docs/recipes/README.md) for axes, multi-clip timelines, loading, canvas, responsive behavior, and framework lifecycles.
- [Guides](docs/guides/README.md) for media preparation, performance, accessibility, and browser support.
- [API reference](docs/api/controller.md) for controller behavior, with dedicated [timeline](docs/api/timeline.md), [video](docs/api/video.md), and [canvas](docs/api/canvas.md) references.
- [Troubleshooting](docs/troubleshooting.md) for common integration symptoms and stable error codes.
- [Version 1 acceptance matrix](docs/v1-acceptance.md) for implemented, operator-pending, and release-pending evidence.
- [Changelog](CHANGELOG.md) and the [release maintainer guide](docs/guides/releasing.md) for version history and the publication boundary.
- [Architecture decisions](docs/decisions/0001-package-foundation.md) for the public design rationale.

## Development

Use Node.js 24 LTS and pnpm 11. CI also validates the supported Node.js 22 line.

```sh
pnpm install
pnpm check
```

The required gate covers formatting, documentation links, linting, TypeScript, deterministic tests and coverage, builds, bundle budgets, package metadata, declarations, and built entry imports. The prepared [browser validation suite](docs/guides/browser-support.md) is run separately by an operator because codecs and media presentation vary by runtime.

## Contributing

Focused bug reports, documentation improvements, design feedback, and implementation proposals are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. Significant API or architecture changes should begin with an issue so their trade-offs can be discussed publicly.

The core remains framework agnostic. A maintained Vue example is planned after the first core release; other framework examples will be open to community pull requests once that example contract is established.

Project communication, code, tests, and public documentation are in English. See the [Code of Conduct](CODE_OF_CONDUCT.md), [support policy](SUPPORT.md), [security policy](SECURITY.md), and [governance model](GOVERNANCE.md).

## License

Licensed under the [MIT License](LICENSE).
