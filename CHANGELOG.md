# Changelog

All notable changes to `@frame-by-frame/core` will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/). Release entries are curated by a maintainer from merged pull requests; commit history is not used as a substitute for user-facing release notes.

## [Unreleased]

## [1.0.0-rc.1] - 2026-07-20

The first public release candidate freezes the intended version 1 core API for integration and packaging feedback. See the [candidate release notes](docs/releases/v1.0.0-rc.1.md) for installation, package entries, compatibility evidence, and known limitations.

### Added

- Deterministic pixel and normalized-progress timelines with forward, reverse, multi-clip, and global or per-segment easing.
- Framework-independent controllers for vertical, horizontal, and simultaneous scroll sources.
- Native video rendering with bounded latest-value-wins seeking and aggregate readiness.
- Native, full-file, manual, first-use, and viewport-triggered media loading policies.
- Ordered responsive overrides, reduced-motion behavior, and complete lifecycle cleanup.
- Opt-in video-backed 2D canvas rendering through a separate package entry.
- SSR-safe ESM entries, public TypeScript contracts, and a dependency-free runtime.

### Documentation

- API references, integration recipes, operational guides, troubleshooting, public architecture decisions, and a traceable version 1 acceptance matrix.

### Quality

- Required Node.js 22 and 24 gates for formatting, documentation, linting, types, deterministic behavior, coverage, builds, package entries, bundle budgets, dependency review, and CodeQL.
- An operator-only Chromium, Firefox, and WebKit validation suite with repository-owned media fixtures and platform-qualified result reporting.

### Known limitations

- Native media seeking and frame presentation remain subject to browser decoder, codec, asset-hosting, and device behavior; the package does not promise frame-exact presentation for every media pipeline.
- Browser evidence is qualified by the exact tested platforms in the [validation record](docs/browser-validation-results.md), and the release candidate does not claim universal Safari or WebKit compatibility.
- The package is ESM-only and requires an ESM-capable runtime or bundler.

[Unreleased]: https://github.com/mariozenmedina/frame-by-frame/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/mariozenmedina/frame-by-frame/releases/tag/v1.0.0-rc.1
