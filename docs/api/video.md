# Native video renderer

Each controller binding owns one native `HTMLVideoElement`. A binding can use an existing video through `target`, or ask the package to create one inside `mountTo`.

This renderer is included by the root `@frame-by-frame/core` factory. The opt-in canvas entry reuses the same loading and seeking pipeline behind a visible canvas; see the [2D canvas renderer guide](canvas.md) for the additional frame-copy and sizing behavior.

> [!IMPORTANT]
> Native media APIs depend on browser, codec, server range support, and asset encoding. `frame-by-frame` bounds its scheduling work, but cannot guarantee exact frame presentation for every media file.

## Basic configuration

```ts
const controller = createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'story',
          target: () => document.querySelector<HTMLVideoElement>('#story-video'),
          clips: [
            {
              id: 'intro',
              sources: [
                { src: '/media/intro.webm', type: 'video/webm; codecs="vp9"' },
                { src: '/media/intro.mp4', type: 'video/mp4' },
              ],
              poster: '/media/intro.jpg',
              preload: 'metadata',
            },
            {
              id: 'detail',
              sources: [{ src: '/media/detail.mp4' }],
            },
          ],
          segments: [
            { scroll: [0, 600], clip: 'intro', media: [0, 5] },
            { scroll: [600, 1200], clip: 'detail', media: [3, 9] },
          ],
        },
      ],
    },
  },
});

await controller.mount();
```

Every clip ID must be unique within its binding. With multiple clips, every segment must name a configured clip. A single-clip binding may omit `segment.clip`.

## Targets and ownership

`target` and `mountTo` accept a direct element, selector, or synchronous resolver. They are resolved by `mount()`, not by `createFrameByFrame()`. The resolved `target` must be a video; `mountTo` must be an HTML element.

Only one mounted binding may control a video target at a time, including bindings in different controllers. A conflict rejects mount with `TARGET_CONFLICT`.

For a created video, defaults are `muted: true`, `playsInline: true`, and `controls`, `autoplay`, and `loop` disabled. `video` overrides the first four configurable properties:

```ts
video: {
  muted: true,
  playsInline: true,
  controls: false,
  loop: false,
}
```

For an existing video, only explicit overrides are applied. Destruction pauses and clears package media, restores the original relevant attributes and properties, and releases ownership. It does not promise to restore the previous decoded buffer, playback position, or displayed frame. A created video is removed from its container.

Use `controller.getTarget(bindingId)` to access the mounted element. It returns `null` before mount and throws for unknown bindings or after destruction.

## Sources and loading

Source candidates are ordered. Candidates with a declared `type` are first filtered through `canPlayType()`; candidates without a type remain eligible. If a candidate emits a native media error, the next candidate is attempted. A terminal error is attached to that binding and emitted without stopping other bindings or the scroll controller.

`preload` accepts `none`, `metadata`, `auto`, or `full` and defaults to `metadata`. The first three values are native browser hints. In particular, `auto` is not a guarantee that the entire file was downloaded.

`full` is package-managed: the selected candidate is fetched into a `Blob`, an object URL is assigned to the active video, and the original source URL remains visible in state and errors. Immediate bindings prepare every full-preload clip, including inactive clips, without creating hidden video decoders. The assets remain reference-counted until `unload()` or `destroy()`.

> [!WARNING]
> Full preload may hold the downloaded `Blob`, its object URL, and browser decoder buffers at the same time. This is useful for deterministic clip transitions but can consume substantial memory, especially on mobile devices. Prefer native or on-demand loading when full-file ownership is unnecessary.

Binding-level `loading` controls when work starts:

```ts
{
  id: 'story',
  target: '#story-video',
  clips: [
    {
      id: 'intro',
      sources: [{ src: 'https://media.example.com/intro.mp4', type: 'video/mp4' }],
      preload: 'full',
    },
  ],
  loading: {
    mode: 'on-demand',
    trigger: 'target-near-viewport',
    rootMargin: '500px 0px',
    credentials: 'omit',
    cache: 'default',
  },
  segments: [{ scroll: [0, 800], clip: 'intro', media: [0, 8] }],
}
```

Loading is `immediate` by default. On-demand mode requires one explicit trigger:

- `manual`: only `controller.load(id?)` activates the binding;
- `target-near-viewport`: a one-shot `IntersectionObserver` activates it when the target enters `rootMargin`, which defaults to `0px`;
- `first-use`: the first non-null timeline resolution activates the currently requested clip.

Immediate, viewport-triggered, and manual activation prepare all configured full clips. `first-use` prepares only the clip reached by the timeline; later clips are fetched when first selected. Native preload hints still apply only to the active clip.

`credentials` and `cache` map to the corresponding Fetch API request options and are only valid when the binding has a full-preload clip. `only-if-cached` uses the Fetch-required `same-origin` mode and therefore cannot retrieve a cross-origin asset. Requests with the same resolved URL, credentials, and cache mode share one internal fetch across controllers. The request is aborted only after its last consumer releases it, and the object URL is revoked after its final reference is released.

## CORS and request failures

Full preload uses Fetch, so a cross-origin server must authorize the application origin with an appropriate `Access-Control-Allow-Origin` response. Setting the video's `crossOrigin` property does not bypass Fetch CORS checks.

For credentialed cross-origin requests, configure `credentials: 'include'` and ensure the server permits credentials for the explicit application origin. A wildcard origin cannot be used with credentials. Network, HTTP, CORS, URL, and object-URL failures try the next playable source before producing `FULL_PRELOAD_FAILED`.

Mount starts the currently resolved clip but does not wait for the network or metadata. Explicit controls are available when an application needs them:

```ts
await controller.load('story'); // resolves at loadedmetadata
controller.unload('story'); // clears and disables implicit loading
await controller.load('story'); // reloads the latest resolved clip
```

Omit the ID to affect every binding.

## Readiness and loading screens

`mount()` remains independent from network speed: it resolves after targets, timelines, and automatic policies are initialized. Use `whenReady()` as the aggregate barrier for a loading screen:

```ts
await controller.mount();

try {
  await controller.whenReady();
} finally {
  document.querySelector('#loading-screen')?.remove();
}
```

The current readiness cycle waits for every immediate full preload. For the active native clip, `metadata` waits for `loadedmetadata`, while `auto` and `full` wait for the first `loadeddata`. `none` and on-demand work that has not been triggered do not block. Multiple callers observe the same work, and a newer media generation supersedes obsolete clip readiness. A required failure rejects with `FrameByFrameError`; use `finally` when the loading screen must also close on failure.

`load()` remains the imperative operation and resolves at `loadedmetadata`. It activates manual bindings and can restart a binding after `unload()` or a failed full preload.

Full preload progress is available in both state and events. `totalBytes` and `ratio` are `null` when the server omits a usable `Content-Length`:

```ts
controller.on('loadprogress', ({ bindingId, clipId, loadedBytes, totalBytes, ratio }) => {
  updateLoadingScreen({ bindingId, clipId, loadedBytes, totalBytes, ratio });
});
```

## Responsive media and preferences

A committed breakpoint may replace `clips`, `segments`, or media option fields. The controller keeps the same claimed video target and renderer instance, supersedes obsolete readiness work, releases assets no longer owned by the binding, and applies the latest resolution. The complete candidate is validated first, so an invalid clip/segment combination never partially reconfigures a renderer.

An active reduced-motion preference changes media behavior according to the controller's `reducedMotion` option. `first-frame` and `last-frame` keep normal loading policy but request one timeline endpoint. `disable` cancels new loading, seeking, and frame work and releases package-managed media references; `whenReady()` does not wait for disabled work. Returning to the normal preference restores the configured loading policy and synchronizes the latest scroll resolution. `ignore` leaves media behavior unchanged.

Document visibility suspension is intentionally different from reduced-motion disable. Hiding a document pauses new seek and frame scheduling but keeps full-preload cache references and in-progress network ownership. Visibility restoration refreshes scroll metrics and resumes from the latest desired resolution.

## Seek scheduling

Timeline media values are seconds. Pixel or progress units apply only to the scroll side of each segment.

The renderer assigns `HTMLMediaElement.currentTime`; it does not use approximate `fastSeek()`. Before metadata, only the latest target is retained. After metadata, the target is clamped to the known duration.

At most one seek is in flight per binding. Further scroll updates replace one pending target, so obsolete seeks cannot accumulate. After native `seeked`, only the latest pending value is applied.

Small target changes can be ignored with a non-negative finite epsilon:

```ts
seek: {
  timeEpsilon: 0.001;
} // default, in seconds
```

## Frame observation

When `requestVideoFrameCallback()` exists, the renderer registers a one-shot callback for the latest requested frame and cancels stale callbacks on replacement, clip changes, unload, and destroy. The `frame` event exposes a stable subset:

```ts
controller.on(
  'frame',
  ({ bindingId, clipId, presentedTime, expectedDisplayTime, width, height }) => {
    // Observe presentation; do not use this event to enqueue another seek loop.
  },
);
```

Without that API, `loadeddata` and `seeked` emit an approximation based on `currentTime`. Frame observation reports what the browser exposed; it is not a cross-codec guarantee of exact presentation.

## Media preparation

Seek quality is partly an asset and delivery concern. Before shipping a scroll-driven experience:

- encode source variants that browsers in the project's support matrix can decode;
- keep source variants for one logical clip aligned to the same content timeline;
- choose dimensions and bitrate appropriate for the rendered size and target devices;
- use reasonably frequent keyframes when the experience needs responsive arbitrary seeks;
- serve the correct MIME type and support byte-range requests where the hosting stack permits;
- configure CORS when media and the application use different origins;
- validate forward and reverse ranges with the real production assets in every target browser.

The package does not transcode or inspect media. Encoding, hosting, cache policy, and accessibility alternatives remain application responsibilities.

## Binding media state

`getState().bindings[id]` includes:

- `loadState`: `idle`, `loading`, `metadata`, `ready`, `error`, or `unloaded`;
- `loadProgress`: full-preload byte progress keyed by clip ID;
- `activeClipId` and `selectedSource`;
- `duration` when finite metadata is available;
- `appliedTime` from the latest submitted seek;
- `presentedTime` from the latest observed frame;
- `seeking` for an in-flight native seek;
- `error` for the latest binding-scoped media failure.

The timeline `resolution` remains separate. It describes the desired clip and time even while media is unloaded, loading, clamped, or failing.
