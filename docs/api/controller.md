# Scroll controller API

`createFrameByFrame()` connects browser scroll coordinates to one or more deterministic timelines. It owns source observation, animation-frame scheduling, lifecycle, state, and events. Media loading and rendering are deliberately outside the current implementation.

> [!IMPORTANT]
> The npm package has not been released yet. This document describes the contract implemented in the repository.

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
}

interface FrameByFrameAxisConfig {
  readonly enabled?: boolean;
  readonly bindings: readonly FrameByFrameBindingConfig[];
}

interface FrameByFrameBindingConfig extends TimelineOptions {
  readonly id: string;
}
```

At least one axis must contain a binding. Binding IDs must be non-empty and unique across the whole controller. `enabled` defaults to `true`; a disabled axis remains visible in state but its binding resolutions remain `null`.

Pure configuration and timelines are validated and compiled by `createFrameByFrame()`. The source itself is resolved later by `mount()`.

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

The raw scroll listener only schedules work. It performs no dimension or offset reads. Maximum ranges are measured by `mount()` and `refresh()`, while scheduled frames read current offsets and distribute an immutable snapshot to subscribers.

When the final subscriber disables or destroys itself, the listener is removed and any pending animation frame is cancelled.

`requestAnimationFrame` coalesces scroll observation here. It is separate from `requestVideoFrameCallback`, which reports frames presented by a video element and will belong to the media renderer.

## Lifecycle

| Method       | Behavior                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mount()`    | Resolves the source, refreshes metrics, performs initial mapping, subscribes if enabled, and emits `mount` then `update`. Concurrent calls return the same promise; calls after success are no-ops. A failed mount may be retried. |
| `refresh()`  | Recalculates maximum ranges and synchronizes current positions. It requires a successful mount, including while disabled.                                                                                                          |
| `disable()`  | Stops this controller's updates without destroying its source or configuration. It may be called before mount.                                                                                                                     |
| `enable()`   | Resynchronizes a mounted disabled controller and subscribes it again.                                                                                                                                                              |
| `getState()` | Returns a detached read-only snapshot and remains available after destruction.                                                                                                                                                     |
| `on()`       | Adds a typed event listener and returns an idempotent unsubscribe function.                                                                                                                                                        |
| `destroy()`  | Unsubscribes, cancels this controller's pending mount, releases its source reference, emits `destroy`, and removes listeners. It is synchronous and idempotent.                                                                    |

The status is one of `idle`, `mounting`, `ready`, `disabled`, `error`, or `destroyed`. After destruction, every operation except `getState()` and repeated `destroy()` throws `CONTROLLER_DESTROYED`.

## State

```ts
interface FrameByFrameState {
  readonly status: FrameByFrameStatus;
  readonly enabled: boolean;
  readonly source: Document | HTMLElement | null;
  readonly activeBreakpoints: readonly string[];
  readonly axes: Readonly<Partial<Record<'x' | 'y', FrameByFrameAxisState>>>;
  readonly bindings: Readonly<Record<string, FrameByFrameBindingState>>;
  readonly lastError: FrameByFrameErrorInfo | null;
}
```

Axis state contains `enabled`, `offset`, `max`, and `progress`. Binding state contains its `id`, axis, and a `TimelineResolution | null`. Snapshots and their collections are detached from controller internals.

`activeBreakpoints` is an empty reserved field until responsive overrides are implemented. A binding resolution is an output for future renderers; the controller does not currently load clips or seek media.

## Events

| Event     | Payload                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| `mount`   | The first successfully mounted state snapshot.                                             |
| `update`  | `{ reason, state }`, where reason is `mount`, `scroll`, `refresh`, `enable`, or `disable`. |
| `error`   | A `FrameByFrameError` produced by mount or runtime mapping.                                |
| `destroy` | The final destroyed state snapshot.                                                        |

Listener failures do not stop other listeners or corrupt controller state. They are rethrown in a microtask so application bugs remain visible.

## Errors

The controller adds these stable `FrameByFrameError` codes:

| Code                          | Meaning                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `INVALID_CONTROLLER`          | The controller, axes, bindings, or listener shape is invalid.                         |
| `DUPLICATE_BINDING_ID`        | Two bindings in the same controller use one ID.                                       |
| `ENVIRONMENT_UNAVAILABLE`     | Mount requires browser document or animation-frame capabilities that are unavailable. |
| `SOURCE_NOT_FOUND`            | A source is invalid, missing, or its resolver failed.                                 |
| `INVALID_LIFECYCLE_OPERATION` | An operation such as `refresh()` was called before a successful mount.                |
| `CONTROLLER_DESTROYED`        | An operation was attempted after destruction or a pending mount was invalidated.      |

Timeline errors may also occur while controller bindings are resolved. A runtime mapping error moves the controller to `error`, unsubscribes it from scroll updates, stores `lastError`, and emits `error`.

## SSR behavior

Package import and `createFrameByFrame()` do not read `window`, `document`, DOM constructors, or media constructors. `mount()` performs browser capability and source resolution. Mounting an omitted source or selector outside a browser rejects with `ENVIRONMENT_UNAVAILABLE`.

Direct DOM references are accepted for browser-only code. Resolver functions are recommended for component frameworks because they delay ref access until mount.
