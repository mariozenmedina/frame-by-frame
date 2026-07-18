# Browser validation results

- Status: **Not run**
- Commit: _pending operator run_
- Date: _pending operator run_
- Operator: _pending operator run_
- Operating system: _pending operator run_
- Playwright: `1.61.1`
- Command: `pnpm test:browser`

An agent prepared this suite but did not install browsers or execute it. Update this document only from operator-observed evidence.

## Automated matrix

| Project  | Result  | Notes or artifact path |
| -------- | ------- | ---------------------- |
| Chromium | Not run |                        |
| Firefox  | Not run |                        |
| WebKit   | Not run |                        |

All three projects must pass from the same commit before the automated browser matrix is complete. Preserve the first failing trace or report path when a project does not pass.

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

1. Replace the pending environment fields with exact observed values.
2. Mark each automated project `Pass` or `Fail`; include the failed test and artifact path when applicable.
3. Complete the manual supplement without inferring one browser's result from another.
4. Preserve codec, CORS, network, or asset limitations in Notes rather than broadening the compatibility claim.
5. Update the [version 1 acceptance matrix](v1-acceptance.md) only after the corresponding evidence is complete.
