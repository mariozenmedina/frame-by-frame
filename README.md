# frame-by-frame

A framework-agnostic TypeScript library for mapping scroll position to video time with responsive timelines, efficient scheduling, and explicit lifecycle control.

> [!IMPORTANT]
> This project is in early development. No package has been released and the public API is not ready for production use yet.

## Why frame-by-frame?

Scroll-driven video experiences often repeat the same difficult work: resolving the correct scroll source, mapping ranges, coordinating media seeks, handling responsive assets, and cleaning up browser resources. `frame-by-frame` aims to provide that behavior as a small, predictable engine instead of coupling it to one application or framework.

The planned npm package is `@frame-by-frame/core`.

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
