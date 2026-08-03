# Browser validation results

- Status: **Automated matrix complete; manual supplement pending**
- Dates: 2026-07-18
- Revisions:
  - Windows: `29e50eeaddae78e4ef75cd5708e3fefe0e2f9a95`
  - macOS: `9acad7c8af34a76671ffe0979be727979e7cbc6a`
- Operators:
  - Windows: Mário Veronesi Medina
  - macOS: [Dwayne Samuels](https://github.com/DwayneSamuels)
- Operating systems:
  - Windows Professional 25H2 (build 26200.8655, x64)
  - macOS 14.6.1 (build 23G93, Intel x86_64)
- Playwright: `1.61.1`

This record contains operator-observed evidence against a committed revision. Investigation runs with uncommitted harness changes are not release evidence.

The Windows revision is the browser-suite branch head; the macOS revision is its merge commit. The
only tree difference between them is this result document, so the package source, browser suite,
fixtures, and server under test are identical.

## Automated matrix

| Project  | Operating system | Scope                                               | Result  | Notes                                   |
| -------- | ---------------- | --------------------------------------------------- | ------- | --------------------------------------- |
| Chromium | Windows          | Full project                                        | Pass    | 14 passed; no failures or flaky results |
| Firefox  | Windows          | Full project                                        | Pass    | 14 passed; no failures or flaky results |
| WebKit   | Windows          | Nine cases outside native media presentation        | Partial | 9 passed; 5 annotated platform skips    |
| WebKit   | macOS            | Full project, including the five presentation cases | Pass    | 14 passed; no failures or flaky results |

The automated baseline is complete: Chromium and Firefox passed their full projects on Windows, and
WebKit passed its full project on macOS against the equivalent merged browser-suite source. The
Windows WebKit result remains partial platform evidence and is not presented as a WebKit pass.

The Windows run completed all 42 collected cases in 19.6 seconds with 37 passes, five skips, zero failures, and zero flaky results. The annotated WebKit skips cover the three native seek/presentation cases, video-to-canvas pixel drawing, and object-URL playback after full preload. Playwright's last-run status was `passed`; generated reports remain ignored and are not versioned.

## WebKit/macOS evidence

[Dwayne Samuels](https://github.com/DwayneSamuels) ran the full WebKit project with:

- Node.js `22.19.0`;
- pnpm `11.5.3`;
- Playwright `1.61.1`;
- WebKit build 2251 (`webkit_mac14_special-2251`).

The commands were:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install webkit
pnpm build
pnpm exec playwright test --config playwright.config.ts --project=webkit
```

All 14 scenarios passed in 22.3 seconds with zero skips, failures, or flaky results. The run covered
media readiness and loading, source switching, full-preload object URLs, abort and destroy cleanup,
responsive media replacement, reduced motion, canvas resize and lifecycle, and vertical and
horizontal scroll mapping.

Playwright warned that macOS 14 uses a frozen WebKit build that no longer receives updates. The
result validates this pinned Playwright environment; it does not claim branded Safari coverage,
current WebKit coverage, Apple silicon coverage, or compatibility with every macOS version. No
generated browser artifacts were committed.

## Manual supplement

| Check                                                   | Result  | Notes |
| ------------------------------------------------------- | ------- | ----- |
| Chromium hidden-document suspension and restoration     | Not run |       |
| Firefox hidden-document suspension and restoration      | Not run |       |
| WebKit hidden-document suspension and restoration       | Not run |       |
| Actual application bundler and SSR integration          | Not run |       |
| Representative production media, CORS, and range server | Not run |       |
| Reduced-motion fallback remains understandable          | Not run |       |

## Recording a run

1. Add the tested revision, date, operator, exact operating system, architecture, Node.js, pnpm,
   Playwright, and browser build.
2. Keep native Linux, WSL, and container runs as separate environments.
3. Mark each automated row `Pass`, `Partial`, or `Fail`; include skips, the failed test, and artifact
   paths when applicable.
4. Complete the manual supplement without inferring one browser's result from another.
5. Preserve codec, CORS, network, or asset limitations in Notes rather than broadening the
   compatibility claim.
6. Update the [version 1 acceptance matrix](v1-acceptance.md) only after the corresponding evidence
   is complete.
