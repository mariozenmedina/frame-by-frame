# ADR 0005: Advanced media loading and readiness coordination

- Status: Accepted
- Date: 2026-07-15

## Context

Native `preload` values are browser hints and cannot guarantee that a complete asset is locally available. Multi-clip scroll timelines may need deterministic preparation, while other pages should avoid network and memory cost until media is near the viewport or first used. Applications also need one reliable Promise for loading-screen orchestration instead of manually aggregating events from every binding.

The controller must preserve SSR-safe imports, keep `mount()` independent from network latency, retain the existing `load()` contract, and deterministically release fetches, object URLs, observers, and target ownership.

## Decision

`VideoPreload` includes package-managed `full` in addition to the native `none`, `metadata`, and `auto` values. Full preload fetches ordered playable candidates into a `Blob`, creates an object URL, and reports typed byte progress. Native loading remains limited to the active target; immediate full preload may prepare inactive clips without hidden decoders.

One internal asset cache is shared across controllers. Its key contains the resolved URL and relevant request options. Concurrent consumers share a request and object URL, references are explicit, an in-flight request is aborted after its last release, and a completed object URL is revoked after its final release. The v1 cache is not public and retains no asset without an owner.

Bindings use an immediate policy by default or an explicit on-demand trigger: manual, target-near-viewport, or first-use. Viewport observation is one-shot. Immediate, manual, and viewport activation prepare all full clips; first-use prepares clips as their timelines request them.

`controller.whenReady()` observes the latest automatic readiness generation and resolves with a state snapshot. It waits for full fetches and the configured readiness of active native media, but excludes native `none` and on-demand work that has not started. A required failure rejects with a typed error. `mount()` still does not await media, and `load()` still resolves at metadata.

## Consequences

- Applications can implement global loading screens with one Promise and optional progress events.
- Full preload makes memory and CORS costs explicit instead of implying guarantees from native `auto`.
- Multi-controller requests can share bytes without leaking global lifetime control into the public API.
- Full preload can consume substantially more memory than native hints and requires Fetch-compatible CORS responses.
- Unknown `Content-Length` prevents percentage reporting, so totals and ratios remain nullable.
- Responsive generation replacement is supported by the readiness contract; breakpoint configuration itself is delivered separately.
