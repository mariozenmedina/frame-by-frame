# ADR 0009: Enforce deterministic performance and supply-chain gates

- Status: Accepted
- Date: 2026-07-17

## Context

The version 1 runtime already coalesces scroll work, bounds pending seeks, deduplicates canvas output, and keeps the optional canvas implementation outside the default entry. These properties need stable merge gates before release. Elapsed-time benchmarks are unsuitable as required checks because results vary with hardware, operating-system scheduling, and shared CI load.

The public repository also needs first-party controls that prevent vulnerable dependency changes and scan the TypeScript source without introducing third-party services or broad workflow permissions.

## Decision

Required tests assert operation and ownership counts rather than wall-clock duration. Large event bursts must still produce one pending animation frame, one metrics pass, one latest pending seek, and one canvas draw for duplicate presentation notifications.

The build gate follows relative JavaScript imports from the emitted package entries and sums deterministic level-9 gzip sizes per reachable chunk. The root runtime has a 30 KiB ceiling. Files reachable only from the opt-in canvas graph have an 8 KiB incremental ceiling. The root and explicit video graphs are also scanned for canvas implementation markers.

Dependency Review runs on pull requests and rejects newly introduced vulnerabilities at moderate, high, or critical severity. No dependency-license policy is inferred from the project's MIT license. CodeQL analyzes JavaScript and TypeScript on pull requests to `main`, pushes to `main`, and a weekly schedule using its default query suite. Every workflow dependency is pinned to a full commit SHA and receives only the permissions it needs.

Dependabot alerts and security updates are enabled, as is automatic deletion of merged branches. New security checks become required by the `main` ruleset only after their initial pull-request runs succeed.

## Consequences

- Performance regressions in bounded work fail deterministically without machine-specific timing thresholds.
- Package growth and accidental canvas coupling fail the same local and CI command used by contributors.
- Budget changes require a reviewed architectural decision rather than an untracked threshold increase.
- Newly introduced dependency vulnerabilities of moderate severity or greater block merge.
- Code scanning remains first-party and reproducible, but it does not replace review, runtime browser validation, or private vulnerability reporting.
- Browser performance, framework examples, release provenance, and publication remain outside this stage.
