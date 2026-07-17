# Media preparation

Scroll-driven seeking exposes encoding choices more aggressively than linear playback. Prepare and validate real assets early; the library can schedule precise requested times but cannot change codec, keyframe, network, or decoder constraints.

## Source candidates

Provide candidates in preferred order and include an accurate MIME type, including codecs when known. Keep every candidate for one clip semantically equivalent and close in duration so fallback selection does not change the timeline.

```ts
sources: [
  { src: '/chapter.webm', type: 'video/webm; codecs="vp9"' },
  { src: '/chapter.mp4', type: 'video/mp4; codecs="avc1.4d401f"' },
],
```

Verify each candidate in every supported browser rather than assuming a file extension guarantees decoder support.

## Seeking characteristics

- Place keyframes closely enough for the intended seek pattern and acceptable file size.
- Keep dimensions and bitrate proportional to the actual presentation size.
- Test forward, reverse, boundary, and rapid-direction-change seeks.
- Avoid timelines that depend on visual precision finer than the asset and browser can present.
- Treat `frame: { snap: true, fps }` as time quantization, not a cross-browser exact-frame guarantee.

## Multiple clips

Align each segment's media interval with its referenced clip duration. If clips meet at one narrative boundary, validate the last visible frame of the first clip and the first visible frame of the next. Source switching uses one decoder target and is not a crossfade; use separate targets when both clips must be visible simultaneously.

## Delivery and CORS

- Native seeking benefits from servers and CDNs that support byte-range requests.
- Full-file preload uses `fetch`, so the response must permit the configured origin and credentials mode.
- Canvas rendering requires media CORS headers compatible with pixel access; otherwise browsers may block drawing.
- Preserve useful `Content-Length` metadata when byte progress is important. Progress ratios are unavailable when the total is unknown.
- Test cache headers and invalidation with the deployment path, not only a local server.

## Validation checklist

For each production asset, record its candidate order, duration, dimensions, expected timeline intervals, loading policy, CORS behavior, and tested browsers. Exercise slow networks, cached reloads, failed candidates, responsive replacements, and cleanup. See [browser support and manual validation](browser-support.md) for the project-level boundary.
