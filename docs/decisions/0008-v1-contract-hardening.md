# ADR 0008: Freeze the v1 surface and activate package entries

- Status: Accepted
- Date: 2026-07-17

## Context

The implemented core now covers the planned timeline, controller, loading, responsive, native-video, and opt-in canvas behavior. Hardening needs a stable target: adding optional debug, performance, plugin, or custom-renderer APIs at this point would expand the compatibility surface before the existing contract has completed real-browser and release validation.

The package foundation reserved root, video, canvas, and types entry points. The root became the native-video default and canvas became an explicit mixed-renderer entry, but the reserved `./video` module remained empty. A resolvable public subpath with no exports is surprising and provides no useful contract.

## Decision

The v1 behavior surface is frozen. Verified defects and missing evidence may be addressed, but debug configuration, user-configurable performance policy, plugins, custom renderers, and custom composition remain future proposals that require their own public design process.

`@frame-by-frame/core` remains the recommended native-video entry. `@frame-by-frame/core/video` is an explicit alias that exports the same `createFrameByFrame`, `createTimeline`, `FrameByFrameError`, and video-only types. `@frame-by-frame/core/canvas` remains the opt-in entry for controllers that may mix video and canvas bindings. `@frame-by-frame/core/types` remains a type-only subpath with no runtime exports.

The 23 product acceptance criteria are published in a versioned matrix. Deterministic Node evidence, operator-only browser evidence, and release evidence are reported separately so the repository does not imply that an unreleased or structurally tested behavior has completed every compatibility check.

## Consequences

- Consumers may choose either the concise root import or an explicit video-named import without receiving different behavior or types.
- Canvas remains excluded from the root and video-only controller contracts.
- Hardening work has a traceable completion target and cannot silently grow the public API.
- Some criteria remain visibly pending until the operator browser suite and Stage 9 publication complete.
- Future API proposals may replace this freeze only through a new issue and architectural decision.
