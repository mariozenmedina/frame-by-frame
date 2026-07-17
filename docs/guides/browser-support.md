# Browser support and manual validation

The package has not published a browser support matrix yet. The build targets ES2022 and the repository's browserslist uses `baseline widely available`, but a stable support claim waits for the Stage 8D operator suite with real browsers, codecs, media assets, scrolling, and frame presentation.

## Runtime capabilities

| Capability                       | When it is needed                                   | Package behavior or boundary                        |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `requestAnimationFrame`          | Every mounted controller                            | Required for coalesced scroll updates               |
| `matchMedia`                     | Reduced motion and responsive breakpoints           | Required by mounted environment observation         |
| `ResizeObserver`                 | Automatic custom-source and target resize response  | Optional; application code may call `refresh()`     |
| `requestVideoFrameCallback`      | Native frame-presentation observation               | Optional; media events provide an approximation     |
| `IntersectionObserver`           | `target-near-viewport` loading                      | Required only for that trigger                      |
| `fetch`, `Blob`, and object URLs | `preload: 'full'`                                   | Required only for package-managed full-file preload |
| Canvas 2D                        | A canvas binding from `@frame-by-frame/core/canvas` | Required only by the opt-in canvas renderer         |

Node.js 22.18+ and 24.11+ are repository tooling environments, not browser runtime claims.

## What automation covers

Node-based tests cover deterministic mapping, configuration, scheduling, ownership, loading state, rendering decisions, public types, package entries, and error paths with structural browser fakes. They intentionally do not claim real codec, decoder, networking, layout, intersection, or composed-frame behavior.

## Operator validation boundary

Before the first release, the operator suite must exercise at least:

- default-document and custom-element sources;
- vertical, horizontal, and simultaneous axes;
- ordered source fallback and real metadata readiness;
- native, full-file, manual, first-use, and viewport loading;
- rapid forward and reverse seeks with representative encoding;
- responsive source replacement and reduced-motion changes;
- canvas fitting, resizing, CORS behavior, and first draw;
- visibility changes, unload, remount where supported, and final destroy;
- SSR import plus the actual application bundler integration.

Until that evidence is recorded, treat browser compatibility as unconfirmed and test the exact browsers, codecs, assets, and hosting configuration required by the application. Track the public readiness state in the [version 1 acceptance matrix](../v1-acceptance.md).
