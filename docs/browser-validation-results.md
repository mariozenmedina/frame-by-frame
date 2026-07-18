# Browser validation results

- Status: **Not run**
- Commit: _pending operator run_
- Date: _pending operator run_
- Operator: _pending operator run_
- Operating systems: _pending operator runs_
- Playwright: `1.61.1`
- Command: `pnpm test:browser`

Update this document only from operator-observed evidence against a committed revision. Investigation runs with uncommitted harness changes do not become release evidence.

## Automated matrix

| Project  | Operating system | Scope                                               | Result  | Notes or artifact path |
| -------- | ---------------- | --------------------------------------------------- | ------- | ---------------------- |
| Chromium | _pending_        | Full project                                        | Not run |                        |
| Firefox  | _pending_        | Full project                                        | Not run |                        |
| WebKit   | Windows          | Nine cases outside native media presentation        | Not run |                        |
| WebKit   | macOS            | Full project, including the five presentation cases | Not run |                        |

Chromium and Firefox must pass their full projects, and WebKit must pass its full project on macOS, all from the same commit, before the automated browser matrix is complete. A Windows run that reports 37 passes and five annotated WebKit skips is partial evidence, not a WebKit pass. Preserve the first failing trace or report path when a project does not pass.

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
