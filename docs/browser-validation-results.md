# Browser validation results

- Status: **Partial**
- Commit: `29e50eeaddae78e4ef75cd5708e3fefe0e2f9a95`
- Date: 2026-07-18
- Operator: Mário Veronesi Medina
- Operating systems: Windows Professional 25H2 (build 26200.8655, x64); macOS pending
- Playwright: `1.61.1`
- Command: `pnpm test:browser`

This record contains operator-observed evidence against a committed revision. Investigation runs with uncommitted harness changes are not release evidence.

## Automated matrix

| Project  | Operating system | Scope                                               | Result  | Notes or artifact path                  |
| -------- | ---------------- | --------------------------------------------------- | ------- | --------------------------------------- |
| Chromium | Windows          | Full project                                        | Pass    | 14 passed; no failures or flaky results |
| Firefox  | Windows          | Full project                                        | Pass    | 14 passed; no failures or flaky results |
| WebKit   | Windows          | Nine cases outside native media presentation        | Partial | 9 passed; 5 annotated platform skips    |
| WebKit   | macOS            | Full project, including the five presentation cases | Not run | Pending community operator evidence     |

Chromium and Firefox must pass their full projects, and WebKit must pass its full project on macOS, all from the same commit, before the automated browser matrix is complete. A Windows run that reports 37 passes and five annotated WebKit skips is partial evidence, not a WebKit pass. Preserve the first failing trace or report path when a project does not pass.

The Windows run completed all 42 collected cases in 19.6 seconds with 37 passes, five skips, zero failures, and zero flaky results. The annotated WebKit skips cover the three native seek/presentation cases, video-to-canvas pixel drawing, and object-URL playback after full preload. Playwright's last-run status was `passed`; generated reports remain ignored and are not versioned.

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

1. Replace the pending environment fields with the exact observed operating systems and versions.
2. Mark each automated row `Pass`, `Partial`, or `Fail`; include skips, the failed test, and artifact paths when applicable.
3. Complete the manual supplement without inferring one browser's result from another.
4. Preserve codec, CORS, network, or asset limitations in Notes rather than broadening the compatibility claim.
5. Update the [version 1 acceptance matrix](v1-acceptance.md) only after the corresponding evidence is complete.
