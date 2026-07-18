# Browser media fixtures

These four short, silent videos are original test fixtures generated for `frame-by-frame`. They are versioned locally so the operator suite has no media-host or network dependency.

| File           | Container and codec | SHA-256                                                            |
| -------------- | ------------------- | ------------------------------------------------------------------ |
| `primary.webm` | WebM with VP8       | `4cb56245d8519978775aaec99a931c50fad87a8ffb9d5935652f2f5d688562a6` |
| `primary.mp4`  | MP4 with H.264      | `9c9172d9e280a968b3752bb28e43ce798d033d6d225ad8d652dd776bba2dd6e4` |
| `accent.webm`  | WebM with VP8       | `5c3ef9d1182b8e2b042d39b9ae3c93d24bc77f515249c4c5ddf0411edb1a6a57` |
| `accent.mp4`   | MP4 with H.264      | `f7cbec2306006c3570be87ab0f04e8e331c33a248b07e6d5f550693781c4dd87` |

Each file is 160×90, one second long at 12 frames per second, has no audio, and encodes every frame as a keyframe. The primary and accent patterns are visually distinct so tests can observe source changes; both contain motion so seeking can exercise different decoded frames. WebM is attempted first and MP4 is the ordered fallback.

Regenerate and verify all four files from the repository root with:

```sh
pnpm generate:browser-media
```

The script runs FFmpeg in a network-disabled `linux/amd64` Docker container. Its image is pinned to `jrottenberg/ffmpeg:7.1-alpine` by immutable manifest digest, uses one encoding thread, and rejects output whose SHA-256 differs from this manifest. No browser is installed or executed by the generation command.
