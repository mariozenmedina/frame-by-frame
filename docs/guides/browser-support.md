# Browser support and operator validation

The package has not published a browser support matrix yet. The build targets ES2022 and the repository's browserslist uses `baseline widely available`, but a stable support claim waits for recorded results from real browsers, codecs, media assets, scrolling, and frame presentation.

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

## Evidence boundaries

Node-based tests cover deterministic mapping, configuration, scheduling, ownership, loading state, rendering decisions, public types, package entries, and error paths with structural browser fakes. They intentionally do not claim real codec, decoder, networking, layout, intersection, or composed-frame behavior.

The Playwright suite uses the real built package, a local dependency-free server with byte-range support, and repository-owned WebM/MP4 fixtures. It runs the portable scenarios in Chromium, Firefox, and WebKit, with explicit platform annotations where the bundled browser cannot provide equivalent media behavior. It is deliberately excluded from `pnpm check`, GitHub Actions, and required checks: browser installation and execution belong exclusively to the operator.

[Playwright documents](https://playwright.dev/docs/browsers#webkit) substantial operating-system differences in media codecs and recommends WebKit on macOS for video playback closest to Safari. On Windows, the suite therefore skips only five WebKit cases that require native seeking and presentation, video-to-canvas pixels, or object-URL playback. The other nine WebKit cases still exercise metadata, loading policy, clip replacement, responsiveness, reduced motion, and lifecycle behavior. A Windows result with five skips is partial evidence and never completes the WebKit or Safari compatibility claim; a WebKit run on macOS remains required before version 1.

No browser result is implied by linting, type checking, building, or collecting these files.

## Operator runbook

From a clean checkout of the commit being validated:

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
```

The last command builds the package, starts the local fixture server, and runs every configured browser project. It does not contact an application server or external media host. Failure artifacts are written to ignored `test-results/` and `playwright-report/` directories.

To repeat one browser while investigating a failure:

```sh
pnpm build
pnpm exec playwright test --config playwright.config.ts --project=chromium
```

Replace `chromium` with `firefox` or `webkit`. Do not treat a focused pass as completion of the three-browser matrix. On Windows, an expected complete local command reports 37 passes and five annotated WebKit skips; record it as partial evidence. Run the same commit with the WebKit project on macOS to exercise those five cases:

```sh
pnpm build
pnpm exec playwright test --config playwright.config.ts --project=webkit
```

The automated matrix is complete only when the full Chromium and Firefox projects pass and the full WebKit project passes on macOS from the same commit.

Record the commit, operating system, Playwright version, browser projects, command, results, and relevant artifact paths in [browser validation results](../browser-validation-results.md). Report a failure with the first package error, failed assertion, browser project, trace path, and sanitized console output.

## Automated browser scenarios

The operator suite covers:

- default-document vertical scrolling;
- custom-element horizontal scrolling;
- simultaneous independent axes;
- real native media selection, metadata, readiness, seeking, and multi-clip switching;
- manual, first-use, and viewport-triggered loading;
- full-file preload progress, object URL revocation, and in-flight abort cleanup;
- responsive media replacement and reduced-motion behavior;
- canvas decoding, drawing, pixel access, and bitmap resize;
- disable, enable, unload, reload, destroy, and scroll-listener cleanup.

SSR-safe built imports remain covered by `pnpm test:package`, which runs in Node without a DOM.

## Manual supplement

Playwright does not provide one portable way to force a real hidden-document lifecycle across all three browser engines. The operator must therefore switch the fixture tab or window into and out of the background in each target browser and confirm suspension plus a synchronized `visibility` refresh on return.

Before release, also validate the actual application bundler and representative production assets, codecs, CORS policy, range delivery, network conditions, and device constraints. Passing the repository fixtures cannot guarantee another encoding or host configuration.

Until automated and manual evidence is recorded, treat browser compatibility as unconfirmed. Track the release-level state in the [version 1 acceptance matrix](../v1-acceptance.md).
