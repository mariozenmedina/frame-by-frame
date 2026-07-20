# Documentation

This directory is the public documentation map for `frame-by-frame`. Version `1.0.0-rc.1` is the first release candidate for the frozen v1 core API; it invites integration feedback and is not the stable `1.0.0` release.

## Choose a path

- **Integrating the package:** start with the [recipes](recipes/README.md).
- **Preparing a production experience:** read the [guides](guides/README.md).
- **Maintaining a release:** follow the [release maintainer guide](guides/releasing.md).
- **Evaluating the candidate:** read the [`1.0.0-rc.1` release notes](releases/v1.0.0-rc.1.md).
- **Looking up exact behavior:** use the [API reference](#api-reference).
- **Diagnosing a problem:** use [troubleshooting](troubleshooting.md).
- **Evaluating v1 readiness:** see the [version 1 acceptance matrix](v1-acceptance.md).
- **Understanding a design trade-off:** read the [architecture decisions](#architecture-decisions).

## Recipes

- [Vertical, horizontal, and simultaneous axes](recipes/basic-axes.md)
- [Multi-clip timelines and easing](recipes/multi-clip-easing.md)
- [Loading and readiness](recipes/loading-and-readiness.md)
- [Opt-in canvas rendering](recipes/canvas.md)
- [Responsive timelines and reduced motion](recipes/responsive-and-reduced-motion.md)
- [SSR and framework lifecycle](recipes/framework-lifecycle.md)

## Guides

- [Media preparation](guides/media-preparation.md)
- [Performance](guides/performance.md)
- [Accessibility](guides/accessibility.md)
- [Browser support and manual validation](guides/browser-support.md)
- [Browser validation results](browser-validation-results.md)
- [Release maintainer guide](guides/releasing.md)

## API reference

- [Controller](api/controller.md)
- [Timeline](api/timeline.md)
- [Native video renderer](api/video.md)
- [2D canvas renderer](api/canvas.md)

## Architecture decisions

- [ADR 0001: Package foundation](decisions/0001-package-foundation.md)
- [ADR 0002: Timeline mapping contract](decisions/0002-timeline-mapping-contract.md)
- [ADR 0003: Shared scroll controller](decisions/0003-shared-scroll-controller.md)
- [ADR 0004: Native video renderer](decisions/0004-native-video-renderer.md)
- [ADR 0005: Advanced media loading](decisions/0005-advanced-media-loading.md)
- [ADR 0006: Responsive preferences](decisions/0006-responsive-preferences.md)
- [ADR 0007: Opt-in canvas renderer](decisions/0007-opt-in-canvas-renderer.md)
- [ADR 0008: Version 1 contract hardening](decisions/0008-v1-contract-hardening.md)
- [ADR 0009: Performance and supply-chain gates](decisions/0009-performance-and-supply-chain-gates.md)
- [ADR 0010: Documentation architecture](decisions/0010-documentation-architecture.md)
- [ADR 0011: Operator-only browser validation](decisions/0011-operator-browser-validation.md)
- [ADR 0012: Version 1 release governance](decisions/0012-v1-release-governance.md)

## Community

- [Contributing](../CONTRIBUTING.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Support](../SUPPORT.md)
- [Security](../SECURITY.md)
- [Governance](../GOVERNANCE.md)
- [MIT License](../LICENSE)
