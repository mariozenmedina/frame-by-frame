# Native video renderer

Each controller binding owns one native `HTMLVideoElement`. A binding can use an existing video through `target`, or ask the package to create one inside `mountTo`.

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

`preload` accepts `none`, `metadata`, or `auto` and defaults to `metadata`. It is a browser hint, not a download guarantee. This stage keeps only the active clip on the video target; hidden decoder pools, full-file fetching, object URLs, and on-demand range strategies are future work.

Mount starts the currently resolved clip but does not wait for the network or metadata. Explicit controls are available when an application needs them:

```ts
await controller.load('story'); // resolves at loadedmetadata
controller.unload('story'); // clears and disables implicit loading
await controller.load('story'); // reloads the latest resolved clip
```

Omit the ID to affect every binding.

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
- `activeClipId` and `selectedSource`;
- `duration` when finite metadata is available;
- `appliedTime` from the latest submitted seek;
- `presentedTime` from the latest observed frame;
- `seeking` for an in-flight native seek;
- `error` for the latest binding-scoped media failure.

The timeline `resolution` remains separate. It describes the desired clip and time even while media is unloaded, loading, clamped, or failing.
