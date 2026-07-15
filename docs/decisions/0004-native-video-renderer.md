# ADR 0004: Native video ownership and bounded seeking

- Status: Accepted
- Date: 2026-07-15

## Context

The timeline and shared scroll controller produce a desired clip and media time but do not render it. The first renderer must remain framework-independent, work with multiple clips and source formats, avoid unbounded seek queues during fast scrolling, and cleanly coexist with application-owned video elements.

Native media loading and presentation are asynchronous. `preload` is only a hint, codec support differs by browser, a seek may still be in flight when new scroll values arrive, and precise frame presentation cannot be guaranteed for every asset.

## Decision

The first renderer uses one `HTMLVideoElement` per binding. Configuration requires exactly one existing `target` or creation container `mountTo`, plus one or more logical clips with ordered source candidates.

Target references are resolved at mount. A process-local weak registry prevents simultaneous ownership conflicts across bindings and controllers. Created videos receive safe inline defaults and are removed at destroy. Supplied videos are paused, explicitly configured, and restored on a best-effort basis when released.

Mount begins the selected clip without waiting for metadata. Only the active clip is attached. Typed source candidates are filtered with `canPlayType()` and remaining candidates are tried in order. Media load, decode, and seek failures stay binding-scoped; target/configuration failures reject mount.

Seeking uses precise `currentTime` assignments. Each binding allows one in-flight seek and one replaceable pending target. The pending slot always contains the latest meaningful timeline value. Targets are retained before metadata, clamped after duration becomes known, and deduplicated with a configurable time epsilon.

`requestVideoFrameCallback()` is used as a one-shot observation mechanism when available. Native `loadeddata` and `seeked` events provide a `currentTime` approximation otherwise. All listeners, callbacks, sources, target ownership, and created elements are released on unload or destroy as appropriate.

## Consequences

- Scroll bursts produce bounded seek work instead of an accumulating queue.
- A timeline can select granular ranges from different video files while keeping easing global or segment-specific.
- Applications may use direct elements, selectors, or framework ref resolvers without framework code in the package.
- Media errors can be handled per binding while other timelines continue.
- Switching clips may show native loading latency because this stage does not keep a decoder pool.
- `preload`, `currentTime`, and frame callbacks remain subject to browser and asset behavior.
- Full-file fetching, on-demand byte strategies, responsive overrides, reduced-motion policies, smoothing, and canvas rendering remain separate future decisions.
