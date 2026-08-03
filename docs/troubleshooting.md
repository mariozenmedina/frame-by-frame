# Troubleshooting

Start from the first emitted or thrown `FrameByFrameError`. Its stable `code`, `cause`, and `details` are more useful than a later media symptom. The [controller API reference](api/controller.md#errors) lists every current code.

## Nothing changes while scrolling

- Await `mount()` and inspect `controller.getState().status`.
- Confirm the configured axis is enabled and its `offset`, `max`, and `progress` change.
- Check that pixel segments use the source's scroll offset, not media seconds or viewport coordinates.
- For progress segments, ensure the source has a nonzero scrollable range.
- Call `refresh()` after application-owned layout changes.
- Check whether reduced motion pins the timeline or `disable()` was called.

Likely codes: `SOURCE_NOT_FOUND`, `ENVIRONMENT_UNAVAILABLE`, `INVALID_CONTROLLER`, `INVALID_LIFECYCLE_OPERATION`.

## The target is missing or rejected

Selectors and resolvers are evaluated at mount. Render the target first and make sure it has the type required by the binding. One target cannot be claimed by multiple live bindings.

Likely codes: `TARGET_NOT_FOUND`, `INVALID_TARGET_TYPE`, `TARGET_CONFLICT`.

## Media does not become ready

- Inspect `loadState`, `activeClipId`, `selectedSource`, and the binding error.
- Verify candidate URLs, MIME types, codecs, server responses, and clip duration.
- Remember that manual and viewport bindings do not block `whenReady()` before activation.
- `preload: 'none'` does not participate in automatic readiness.
- Listen to `loadstart`, `loadedmetadata`, `loadready`, `loadprogress`, and `error` while diagnosing.

Likely codes: `MEDIA_SOURCE_UNSUPPORTED`, `MEDIA_LOAD_FAILED`, `FULL_PRELOAD_FAILED`, `MEDIA_DECODE_FAILED`.

## Full preload or canvas fails across origins

Full preload uses `fetch`; canvas copies decoded pixels. Configure the media server's CORS response for the application origin and match the binding's `crossOrigin` and loading credentials. Native playback succeeding does not prove that fetch or canvas pixel access is permitted.

Likely codes: `FULL_PRELOAD_FAILED`, `CANVAS_SECURITY_ERROR`, `CANVAS_DRAW_FAILED`.

## Canvas frames stall or mobile startup becomes impractical

- Start with `preload: 'metadata'` or `'auto'`; `full` owns encoded bytes but does not cache decoded
  frames and can substantially increase mobile memory pressure.
- Keep video dimensions and bitrate appropriate for the physical devices being targeted.
- Try a numeric canvas `pixelRatio`, such as `1`, before using `'device'` on a large mobile canvas.
- Confirm the media emits usable `loadeddata` and `seeked` transitions and that the page is not
  creating its own permanent animation loop around the controller.
- Record whether the visible canvas retains its previous frame while a replacement is pending. A
  repeatable empty bitmap after a successful earlier frame should be reported with a minimal
  reproduction.

Full preload and scrolling through the entire experience are not decoded-frame caches. Browser
decoders may discard decoded frames under memory pressure and decode them again for later seeks.

## The wrong clip or time is selected

- `scroll` uses pixels by default; set `scrollUnit: 'progress'` for normalized coordinates.
- `media` always uses seconds and may run forward or reverse.
- Binding-level easing applies unless a segment overrides it.
- Gaps hold the preceding endpoint, and positions outside the timeline clamp to an endpoint.
- Every segment clip ID must exist in that binding's current clip collection.

Likely codes: `INVALID_TIMELINE`, `INVALID_SEGMENT`, `OVERLAPPING_SEGMENTS`, `INVALID_EASING_RESULT`, `INVALID_FRAME_RATE`.

## A responsive override is ignored

Overrides apply in declaration order and later matching entries win. `clips` and `segments` replace complete arrays rather than merging items. The entire candidate must remain valid; otherwise the controller keeps its last committed configuration and emits `INVALID_BREAKPOINT_CONFIG`.

## SSR fails

Importing and creating a controller are SSR-safe, but `mount()` requires the browser environment and rendered DOM. Move mounting into the framework's client lifecycle hook and call `destroy()` in its cleanup. Do not resolve `document` or query selectors while constructing server-rendered options.

Likely code: `ENVIRONMENT_UNAVAILABLE`.

## Bundle size unexpectedly includes canvas

Import from `@frame-by-frame/core` or `@frame-by-frame/core/video`. Only use `@frame-by-frame/core/canvas` where canvas bindings are needed. Run `pnpm build` followed by `pnpm check:bundle` to validate entry isolation and current gzip budgets.

## Asking for help

If the problem remains, prepare a minimal reproduction and include the package version or commit, browser and operating system, bundler or framework, media candidate metadata, loading policy, error code, and sanitized logs. Follow [SUPPORT.md](../SUPPORT.md) and use the repository's bug report form. Report vulnerabilities privately through [SECURITY.md](../SECURITY.md).
