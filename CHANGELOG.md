# Changelog

All notable changes to `@frame-by-frame/core` will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/). Release entries are curated by a maintainer from merged pull requests; commit history is not used as a substitute for user-facing release notes.

## [Unreleased]

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

[Unreleased]: https://github.com/mariozenmedina/frame-by-frame/commits/main
