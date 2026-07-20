# Scroll controller API

`createFrameByFrame()` connects browser scroll coordinates to deterministic video timelines. It owns source observation, animation-frame scheduling, media targets, renderer lifecycle, state, and events.

> [!IMPORTANT]
> This document describes the `1.0.0-rc.1` contract. The v1 surface is frozen for candidate feedback, but corrections found before stable `1.0.0` will be documented explicitly.

## Example

```ts
import { createFrameByFrame } from '@frame-by-frame/core';

const controller = createFrameByFrame({
  source: () => document.querySelector<HTMLElement>('#scroller'),
  axes: {
    x: {
      bindings: [
        {
          id: 'gallery',
          target: '#gallery-video',
          clips: [{ id: 'wide-shot', sources: [{ src: '/wide-shot.mp4' }] }],
          segments: [
            {
              scroll: [0, 800],
              clip: 'wide-shot',
              media: [2, 10],
            },
          ],
        },
      ],
    },
    y: {
      bindings: [
        {
          id: 'story',
          mountTo: '#story-media',
          clips: [{ id: 'close-up', sources: [{ src: '/close-up.mp4' }] }],
          segments: [
            {
              scroll: [0, 1],
              scrollUnit: 'progress',
              clip: 'close-up',
              media: [12, 4],
            },
          ],
        },
      ],
    },
  },
});

controller.on('update', ({ reason, state }) => {
  const story = state.bindings.story?.resolution;
  console.log(reason, story?.clipId, story?.targetTime);
});

await controller.mount();
```

The `x` and `y` axes are resolved independently. A pixel timeline receives `scrollLeft` or `scrollTop`; a progress timeline receives the corresponding normalized value from `0` to `1`. Every resolution still describes a media clip and time, never a video position in pixels.

## Factory configuration

```ts
interface FrameByFrameOptions {
  readonly source?: Document | HTMLElement | string | (() => Document | HTMLElement | null);
  readonly axes: {
    readonly x?: false | FrameByFrameAxisConfig;
    readonly y?: false | FrameByFrameAxisConfig;
  };
  readonly breakpoints?: readonly FrameByFrameBreakpointConfig[];
  readonly reducedMotion?: 'first-frame' | 'last-frame' | 'disable' | 'ignore';
}

interface FrameByFrameAxisConfig {
  readonly enabled?: boolean;
  readonly bindings: readonly FrameByFrameBindingConfig[];
}

interface FrameByFrameBindingBaseConfig extends TimelineOptions {
  readonly id: string;
  readonly renderer?: 'video';
  readonly clips: readonly VideoClipConfig[];
  readonly loading?: VideoLoadingConfig;
  readonly video?: {
    readonly muted?: boolean;
    readonly playsInline?: boolean;
    readonly controls?: boolean;
    readonly loop?: boolean;
  };
  readonly seek?: { readonly timeEpsilon?: number };
}

type FrameByFrameBindingConfig = FrameByFrameBindingBaseConfig &
  (
    | { readonly target: ElementReference<HTMLVideoElement> }
    | {
        readonly mountTo: ElementReference<HTMLElement>;
      }
  );
```

At least one axis must contain a binding. Binding IDs must be non-empty and unique across the whole controller. Every binding requires exactly one existing `target` or creation container `mountTo`, plus at least one logical clip. `enabled` defaults to `true`; a disabled axis remains visible in state but its binding resolutions remain `null`.

Pure configuration and timelines are validated and compiled by `createFrameByFrame()`. The source itself is resolved later by `mount()`.

The root `@frame-by-frame/core` factory intentionally accepts native-video bindings only. `@frame-by-frame/core/video` is an explicit alias with the same runtime and video-only types. The opt-in `@frame-by-frame/core/canvas` entry exports a compatible factory whose axes may combine video and canvas bindings. See the [native video guide](video.md#entry-points) and [2D canvas renderer guide](canvas.md) for their package boundaries.

## Responsive overrides

Each breakpoint requires a stable `id`, a CSS media `query`, and an `override`. Queries are created only by `mount()`, keeping package import and controller creation SSR-safe.

```ts
breakpoints: [
  {
    id: 'tablet',
    query: '(max-width: 900px)',
    override: {
      axes: {
        y: {
          bindings: [
            {
              id: 'story',
              segments: [{ scroll: [0, 600], clip: 'short', media: [0, 5] }],
              clips: [{ id: 'short', sources: [{ src: '/story-short.mp4' }] }],
              video: { controls: false },
            },
          ],
        },
      },
    },
  },
];
```

Every matching breakpoint is applied in declaration order, so later entries win. Overrides may only reference existing axes and binding IDs. `segments` and `clips` replace their complete arrays; `frame`, `loading`, `video`, `seek`, and canvas presentation options are shallowly merged. Setting an axis to `false` disables it, while a later `{ enabled: true }` re-enables it.

Responsive overrides cannot replace the controller source, binding IDs, axes, renderer type, `target`, `mountTo`, or a canvas decoder target. The complete candidate is recompiled before activation. If the cascade is invalid—for example, replacement segments refer to a clip no longer present—the controller keeps its last valid configuration, remains mounted, stores and emits `INVALID_BREAKPOINT_CONFIG`, and does not emit `breakpointchange`.

Mounted renderers and claimed targets are reused. A media change supersedes obsolete readiness work; a pending `whenReady()` follows the latest committed configuration.

## Reduced motion, resize, and visibility

`reducedMotion` defaults to `first-frame` and follows `(prefers-reduced-motion: reduce)` after mount:

| Value         | Behavior                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| `first-frame` | Keeps each enabled binding at its first timeline endpoint.                                 |
| `last-frame`  | Keeps each enabled binding at its last timeline endpoint.                                  |
| `disable`     | Stops loading, seeking, and frame work and releases package-managed media references.      |
| `ignore`      | Preserves normal scroll-driven behavior. Use only after making an explicit product choice. |

The controller remains mounted and never prevents native scrolling in any mode. Preference changes emit an `update` with reason `preference`.

Window resize events and `ResizeObserver`, when available, share one animation-frame-coalesced refresh path. `refresh()` remains the explicit guarantee for content changes that browser observers cannot detect. While the owning document is hidden, the controller unsubscribes from scroll work and suspends new media frame work without unloading its cache. Visibility restoration refreshes metrics and synchronizes the latest position.

## Scroll sources

When `source` is omitted, the controller uses the current `Document`. A string is queried against the current document, and a function is called synchronously on every mount attempt. Resolver functions are useful when framework refs or elements are not available during controller creation.

A document uses `document.scrollingElement ?? document.documentElement` for metrics and the document itself for scroll events. Passing that same scrolling element is canonicalized back to its document so controllers cannot create duplicate schedulers for one page scroll.

A source with no scrollable range is valid. Its maximum and progress are both `0`; call `refresh()` after content or layout growth to recalculate the range.

## Shared scheduling

All active controllers for the same canonical source share:

- one passive `scroll` listener;
- one cached horizontal and vertical maximum range;
- at most one pending `requestAnimationFrame` callback;
- one offset read per axis during each scheduled frame.

The raw scroll listener only schedules work. It performs no dimension or offset reads. Maximum ranges are measured by `mount()`, `refresh()`, and coalesced resize observation, while scheduled frames read current offsets and distribute an immutable snapshot to subscribers.

When the final subscriber disables or destroys itself, the listener is removed and any pending animation frame is cancelled.

`requestAnimationFrame` coalesces scroll observation here. It is separate from the renderer's one-shot `requestVideoFrameCallback`, which reports frames presented by a video element.

## Lifecycle

| Method          | Behavior                                                                                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mount()`       | Resolves the source and all renderer targets, refreshes metrics, starts configured automatic media work without waiting for it, subscribes if enabled, and emits `mount` then `update`. Concurrent calls share one promise; a failed mount may be retried. |
| `refresh()`     | Recalculates maximum ranges, resizes renderer bitmaps where applicable, and synchronizes current positions. It requires a successful mount, including while disabled.                                                                                      |
| `disable()`     | Stops this controller's scroll updates without unloading media or destroying its configuration. It may be called before mount.                                                                                                                             |
| `enable()`      | Resynchronizes a mounted disabled controller and subscribes it again.                                                                                                                                                                                      |
| `load(id?)`     | Enables loading and resolves after `loadedmetadata` for one binding or all bindings. Calling it after `unload()` reloads the latest resolved clip.                                                                                                         |
| `whenReady()`   | Resolves with the latest state after all currently required automatic media work is ready. Untriggered on-demand work and `preload: 'none'` do not block it.                                                                                               |
| `unload(id?)`   | Cancels pending media work, clears native sources, and prevents implicit reload until `load()` is called.                                                                                                                                                  |
| `getTarget(id)` | Returns the mounted visible element, or `null` before mount. Root controllers return video; canvas-enabled controllers return `HTMLVideoElement                                                                                                            | HTMLCanvasElement`. |
| `getState()`    | Returns a detached read-only snapshot and remains available after destruction.                                                                                                                                                                             |
| `on()`          | Adds a typed event listener and returns an idempotent unsubscribe function.                                                                                                                                                                                |
| `destroy()`     | Unsubscribes, cancels pending source/seek/frame work, restores supplied targets, removes created targets, releases ownership, emits `destroy`, and removes listeners. It is synchronous and idempotent.                                                    |

The status is one of `idle`, `mounting`, `ready`, `disabled`, `error`, or `destroyed`. After destruction, every operation except `getState()` and repeated `destroy()` throws `CONTROLLER_DESTROYED`.

## State

```ts
interface FrameByFrameState {
  readonly status: FrameByFrameStatus;
  readonly enabled: boolean;
  readonly source: Document | HTMLElement | null;
  readonly activeBreakpoints: readonly string[];
  readonly prefersReducedMotion: boolean;
  readonly axes: Readonly<Partial<Record<'x' | 'y', FrameByFrameAxisState>>>;
  readonly bindings: Readonly<Record<string, FrameByFrameBindingState>>;
  readonly lastError: FrameByFrameErrorInfo | null;
}
```

Axis state contains `enabled`, `offset`, `max`, and `progress`. Binding state contains its `id`, axis, `TimelineResolution | null`, renderer type (`video` or `canvas`), load state, full-preload progress by clip ID, active clip and source, known duration, applied and presented times, seeking flag, and binding-scoped media error. For canvas, presented time is published only after a successful draw. Snapshots and their collections are detached from controller internals.

`activeBreakpoints` lists the successfully committed matching IDs in declaration order. `prefersReducedMotion` reports the current media preference independently from the configured behavior. Media failures are stored on the affected binding. They emit `error` but do not change the controller status or `lastError`; source and mapping failures do. A rejected responsive transition stores `lastError` while preserving the mounted status and last valid configuration.

## Events

| Event              | Payload                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `mount`            | The first successfully mounted state snapshot.                                                                  |
| `update`           | `{ reason, state }`; reasons include lifecycle, scroll, breakpoint, preference, resize, and visibility changes. |
| `breakpointchange` | Previous and current committed breakpoint IDs plus current state.                                               |
| `loadstart`        | Binding and clip identity plus current state after a source candidate starts.                                   |
| `loadprogress`     | Binding and clip identity, loaded bytes, nullable total/ratio, and current state.                               |
| `loadedmetadata`   | Binding and clip identity, duration, and current state.                                                         |
| `loadready`        | Binding and clip identity plus current state after native `loadeddata`.                                         |
| `seekrequest`      | Binding and clip identity, requested timeline time, bounded target time, and current state.                     |
| `frame`            | Binding and clip identity, presented media time, optional display time and dimensions, and current state.       |
| `error`            | A `FrameByFrameError` produced by target setup, media, source, or runtime mapping.                              |
| `destroy`          | The final destroyed state snapshot.                                                                             |

Listener failures do not stop other listeners or corrupt controller state. They are rethrown in a microtask so application bugs remain visible.

## Errors

The controller adds these stable `FrameByFrameError` codes:

| Code                          | Meaning                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `INVALID_CONTROLLER`          | The controller, axes, bindings, or listener shape is invalid.                         |
| `INVALID_BREAKPOINT_CONFIG`   | A breakpoint shape, reference, query, or resolved cascade is invalid.                 |
| `DUPLICATE_BINDING_ID`        | Two bindings in the same controller use one ID.                                       |
| `ENVIRONMENT_UNAVAILABLE`     | Mount requires browser document or animation-frame capabilities that are unavailable. |
| `SOURCE_NOT_FOUND`            | A source is invalid, missing, or its resolver failed.                                 |
| `INVALID_LIFECYCLE_OPERATION` | An operation such as `refresh()` was called before a successful mount.                |
| `CONTROLLER_DESTROYED`        | An operation was attempted after destruction or a pending mount was invalidated.      |
| `INVALID_MEDIA_CONFIG`        | A target, clip, source, renderer option, or seek option is invalid.                   |
| `TARGET_NOT_FOUND`            | A target/container selector or resolver did not produce an element.                   |
| `INVALID_TARGET_TYPE`         | A resolved video, canvas, decoder, or mount container has the wrong element type.     |
| `TARGET_CONFLICT`             | Another mounted binding already owns the same visible target or decoder.              |
| `MEDIA_SOURCE_UNSUPPORTED`    | No candidate source can be used for the selected clip.                                |
| `MEDIA_LOAD_FAILED`           | All candidates failed while loading.                                                  |
| `FULL_PRELOAD_FAILED`         | Every playable source failed during explicit full-file fetch or object-URL setup.     |
| `MEDIA_DECODE_FAILED`         | The native decoder rejected the selected media.                                       |
| `MEDIA_SEEK_FAILED`           | The native video target rejected a precise `currentTime` assignment.                  |
| `CANVAS_CONTEXT_UNAVAILABLE`  | A canvas binding could not obtain a 2D rendering context.                             |
| `CANVAS_DRAW_FAILED`          | The decoder frame could not be copied to the visible canvas.                          |
| `CANVAS_SECURITY_ERROR`       | The browser rejected canvas drawing because of a security restriction.                |

Timeline errors may also occur while controller bindings are resolved. A runtime mapping error moves the controller to `error`, unsubscribes it from scroll updates, stores `lastError`, and emits `error`.

## SSR behavior

Package import and `createFrameByFrame()` do not read `window`, `document`, DOM constructors, or media constructors. `mount()` performs browser capability, source, and target resolution. Mounting an omitted source or selector outside a browser rejects with `ENVIRONMENT_UNAVAILABLE`.

Direct DOM references are accepted for browser-only code. Resolver functions are recommended for component frameworks because they delay ref access until mount.
