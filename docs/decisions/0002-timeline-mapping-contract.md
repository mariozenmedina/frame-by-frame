# 0002. Timeline mapping contract

- Status: Accepted
- Date: 2026-07-14

## Context

The controller and media renderers need one deterministic mapping model that can be tested without the DOM. The model must support reverse media ranges, responsive progress coordinates, gaps, optional frame snapping, and timelines that select different video assets across scroll intervals.

Alternative encodings of one video are not the same concept as separate clips. The mapping layer must identify a clip without taking responsibility for file selection, network loading, decoding, or visual transitions.

## Decision

- Expose a pure `createTimeline(options)` API from the package root.
- Snapshot, validate, and sort caller-owned segment configuration without mutation.
- Require one scroll unit per timeline: pixels by default or normalized progress.
- Require increasing scroll intervals while allowing forward or reverse media intervals.
- Clamp before and after the timeline and hold the preceding value in gaps.
- Let a later segment win at a shared boundary.
- Carry an optional stable clip ID through every resolution result.
- Use a timeline-level easing default with per-segment overrides.
- Match CSS curves for named easing and clamp finite custom easing results.
- Keep continuous requested time separate from optional frame-snapped target time.
- Throw package-specific errors for invalid configuration or custom easing behavior.
- Keep asset definitions, loading, decoder switching, crossfades, and rendering outside the mapping layer.

## Consequences

The mapping engine is usable during SSR and independently of the future controller. A media binding can associate clip IDs with one or more source formats later without changing interpolation semantics.

Forbidding mixed units makes overlap validation independent of layout metrics. Direct clip changes remain deterministic, but seamless presentation cannot be guaranteed by the mapping layer and no implicit crossfade is provided.
