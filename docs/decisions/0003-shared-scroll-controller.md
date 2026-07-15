# 0003. Shared scroll controller

- Status: Accepted
- Date: 2026-07-14

## Context

The pure timeline engine needs a browser-facing controller before media renderers can consume its results. Multiple bindings and controllers may observe the same document or element, so listener and measurement work must not scale linearly with binding count. The package must also remain safe to import and configure during SSR.

Animation-frame scroll coalescing and video-frame presentation are distinct responsibilities. Mixing them now would couple source observation to an unimplemented media renderer and make lifecycle cleanup harder to reason about.

## Decision

- Expose `createFrameByFrame({ source?, axes })` from the package root.
- Keep bindings flat by extending the existing timeline options with a controller-wide unique `id`.
- Compile pure timeline configuration at factory time and defer all DOM source resolution to `mount()`.
- Accept an omitted source, document, HTML element, selector, or synchronous resolver.
- Canonicalize a document scrolling element to its owner document.
- Treat a zero scroll range as valid progress `0` and recalculate ranges only on mount or explicit refresh for now.
- Share a scheduler through an internal `WeakMap` keyed by canonical source.
- Use one passive listener and at most one pending animation frame per source.
- Keep the raw listener free of layout and offset reads; one scheduled pass reads offsets and distributes a shared snapshot.
- Keep horizontal and vertical metrics independent, passing CSS pixels or normalized progress according to each timeline's unit.
- Expose explicit `mount`, `refresh`, `enable`, `disable`, `getState`, `on`, and `destroy` lifecycle methods.
- Make concurrent mounts share one promise, permit retry after failure, and allow disable before mount.
- Return detached state snapshots and isolate event listener failures without hiding them.
- Transition to an error state and unsubscribe when runtime mapping fails.
- Keep target discovery, loading, media seeking, canvas drawing, and `requestVideoFrameCallback` outside this controller foundation.

## Consequences

Controller and scheduler behavior can be tested with deterministic non-browser fakes. Package import and controller creation remain SSR-safe, while mounting outside a supported browser fails with a typed error.

One source snapshot can serve many timelines without duplicating listeners or animation-frame callbacks. Maximum ranges can become stale after layout changes until `refresh()` is called; resize observation and visibility suspension remain future work.

The controller now produces clip IDs and target times but does not create a visible effect by itself. Media renderers can consume the same state and scheduling boundaries in a later stage without changing scroll mapping semantics.
