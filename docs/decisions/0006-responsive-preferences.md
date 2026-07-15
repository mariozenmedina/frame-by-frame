# ADR 0006: Responsive overrides and environment preferences

- Status: Accepted
- Date: 2026-07-15

## Context

Scroll-to-media mappings often need different ranges, clips, and loading choices across viewport conditions. The controller also needs an accessible reduced-motion default and bounded reactions to layout and document lifecycle changes. These behaviors must preserve SSR-safe imports, stable target ownership, and deterministic state.

## Decision

Controller options accept an ordered `breakpoints` collection. Each entry has a unique `id`, a non-empty CSS media `query`, and an `override` scoped to existing axes and binding IDs. All matching entries are cascaded in declaration order. Segment and clip arrays replace; option objects shallowly merge. Axis enablement may change, but controller sources, binding identity, axis ownership, renderer type, targets, and mount containers remain fixed.

Media queries are created only during `mount()`. Every candidate cascade is fully compiled and validated before it is committed. Invalid runtime candidates preserve the last valid configuration and mounted controller, emit `INVALID_BREAKPOINT_CONFIG`, and do not publish a partial breakpoint state. Successful changes reuse claimed targets and renderer instances, publish `activeBreakpoints`, and emit `breakpointchange` with previous and current IDs.

`reducedMotion` accepts `first-frame`, `last-frame`, `disable`, or `ignore`, defaulting to `first-frame`. The controller observes `(prefers-reduced-motion: reduce)` at runtime. Endpoint modes pin each binding to its corresponding timeline boundary. Disable mode stops loading, seeking, and frame work and releases package-managed media references without disabling the controller or intercepting native scroll.

Window resize and `ResizeObserver`, when available, enter one animation-frame-coalesced refresh path. Manual `refresh()` remains supported. Hidden documents unsubscribe from scroll work and suspend new renderer frame work without evicting shared cache entries; visibility restoration refreshes metrics and synchronizes state. No environment path creates timers.

## Consequences

- Responsive behavior remains deterministic and inspectable through state and typed events.
- Targets cannot be swapped by media query, avoiding ownership races and structural remounts.
- A clip replacement may require a matching segment replacement; incoherent combinations are rejected atomically at runtime.
- The accessible default changes visual behavior for users who request reduced motion. Applications may choose another explicit mode.
- Resize and visibility reactions are automatic where browser capabilities exist, while manual refresh remains the portable fallback.

## Alternatives considered

Allowing breakpoints to create bindings or replace targets was rejected for v1 because it turns every media-query change into a structural ownership transaction. Ignoring reduced-motion preferences by default was rejected because it conflicts with the repository's accessibility principle. Disabling the entire controller was rejected because preference handling should not erase lifecycle, state, or diagnostics.
