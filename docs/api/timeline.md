# Timeline mapping API

`createTimeline()` builds a deterministic, DOM-independent mapping from scroll coordinates to media clip IDs and times. It is safe to create and resolve a timeline in SSR or other non-browser environments.

> [!IMPORTANT]
> This document describes the `1.0.0-rc.1` contract. The v1 surface is frozen for candidate feedback, but corrections found before stable `1.0.0` will be documented explicitly.

## Example

```ts
import { createTimeline } from '@frame-by-frame/core';

const timeline = createTimeline({
  easing: 'ease-in-out',
  frame: {
    snap: true,
    fps: 30,
  },
  segments: [
    {
      scroll: [0, 100],
      clip: 'video-1',
      media: [2, 8],
    },
    {
      scroll: [100, 250],
      clip: 'video-3',
      media: [12, 6],
      easing: 'linear',
    },
  ],
});

const result = timeline.resolve(150);
```

The result selects `video-3` at the requested media time `10`. The segment-level `linear` easing overrides the timeline-level default, and `targetTime` contains the nearest 30 FPS boundary.

`clip` is an opaque, stable ID. The pure timeline engine does not load a file. A later media binding will associate clip IDs with media assets, where each asset may provide alternative source formats such as WebM and MP4.

## Segments

Every timeline requires at least one segment:

```ts
interface TimelineSegment {
  readonly scroll: readonly [start: number, end: number];
  readonly media: readonly [start: number, end: number];
  readonly scrollUnit?: 'px' | 'progress';
  readonly clip?: string;
  readonly easing?: Easing;
}
```

- Scroll intervals must be strictly increasing.
- Media intervals may move forward or backward, but media times cannot be negative.
- `px` is the default unit and accepts any finite boundaries, including negative offsets.
- `progress` boundaries must stay between `0` and `1`.
- One timeline cannot mix pixel and progress segments.
- Segments are sorted without mutating the caller's array or tuples.
- Overlapping segments are rejected; adjacent segments may share a boundary.

When adjacent segments share a boundary, the later segment wins at that exact position. This makes a clip change explicit and deterministic.

## Resolution phases

`timeline.resolve(position)` returns a new read-only snapshot:

| Phase    | Behavior                                                 | Active segment data                            |
| -------- | -------------------------------------------------------- | ---------------------------------------------- |
| `before` | Holds the first segment's clip and initial media time    | Progress and index are `null`                  |
| `active` | Interpolates inside a segment                            | Original input index and progress are reported |
| `gap`    | Holds the preceding segment's clip and ending media time | Progress and index are `null`                  |
| `after`  | Holds the final segment's clip and ending media time     | Progress and index are `null`                  |

```ts
interface TimelineResolution {
  readonly phase: 'before' | 'active' | 'gap' | 'after';
  readonly segmentIndex: number | null;
  readonly clipId: string | null;
  readonly rawProgress: number | null;
  readonly easedProgress: number | null;
  readonly requestedTime: number;
  readonly targetTime: number;
}
```

`segmentIndex` refers to the segment's position in the original configuration, even when normalization changes its evaluation order.

## Easing

The supported names match the corresponding CSS timing functions:

- `linear`;
- `ease-in`;
- `ease-out`;
- `ease-in-out`.

Timeline-level `easing` is the default for every segment. `segment.easing` overrides it for one interval. When neither is present, easing is linear.

A custom function receives progress between `0` and `1`. Finite results are clamped to that range. A thrown error or non-finite result becomes a typed `INVALID_EASING_RESULT` error with the original cause when available.

## Frame snapping

Snapping is opt-in and requires a finite, positive FPS:

```ts
const timeline = createTimeline({
  frame: { snap: true, fps: 24 },
  segments: [{ scroll: [0, 1], media: [0, 8], scrollUnit: 'progress' }],
});
```

`requestedTime` preserves the continuous eased value. `targetTime` uses `Math.round(requestedTime * fps) / fps`. Snapping selects a target time; it does not guarantee exact visual frame presentation for every encoding, decoder, browser, or device.

## Multiple clips

A timeline may reuse one clip ID or choose different IDs per segment. Resolution guarantees which clip and time apply at each coordinate. It does not perform loading, decoder preparation, visual composition, or an implicit crossfade.

The native video renderer will later prepare and switch clips when possible. Network state, media readiness, encoding, and decoder behavior still affect whether a visual switch appears seamless. Experiences that require simultaneous media or crossfading need separate targets or a future explicit composition strategy.

## Errors

Invalid configuration and resolution inputs throw `FrameByFrameError`:

| Code                    | Meaning                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `INVALID_TIMELINE`      | The timeline is empty, mixes units, has invalid options, or receives a non-finite position |
| `INVALID_SEGMENT`       | A segment has invalid intervals, values, units, clip ID, or easing configuration           |
| `OVERLAPPING_SEGMENTS`  | Two normalized scroll intervals overlap                                                    |
| `INVALID_FRAME_RATE`    | Frame snapping configuration is inconsistent or FPS is not finite and positive             |
| `INVALID_EASING_RESULT` | A custom easing throws or returns a non-finite value                                       |

The error exposes a stable `code`, a message, optional read-only `details`, and the original `cause` when one exists.
