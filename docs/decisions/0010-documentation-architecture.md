# ADR 0010: Use a task-oriented documentation architecture

- Status: Accepted
- Date: 2026-07-17

## Context

The root README accumulated product scope, roadmap, integration examples, renderer behavior, development details, and links to every earlier decision. That detail documented the project but made the repository landing page difficult to scan and repeated information from the API references. Version 1 also needs discoverable guidance for common integrations, media preparation, accessibility, performance, browser validation, troubleshooting, and contributions without adding a documentation service before the content stabilizes.

Repository links are part of the contributor experience. A moved or mistyped local target should fail the same required gate as code regressions without adding a runtime or documentation dependency.

## Decision

The root README is a concise landing page: value, honest release status, capabilities, one first-use example, package boundaries, documentation routes, contribution entry, and community policies.

`docs/README.md` is the documentation map. Task-oriented examples live in `docs/recipes/`; operational advice lives in `docs/guides/`; exact contracts remain in `docs/api/`; common failures live in `docs/troubleshooting.md`; rationale remains in numbered ADRs. Internal documentation links are relative so they work in branches and local clones.

A dependency-free Node script validates local Markdown targets from root public Markdown, `docs/`, and `.github/`. `pnpm check:docs` and the required `pnpm check` gate run it. External destinations and in-page fragments remain outside this deterministic existence check.

No documentation site, framework-specific directory, analytics service, coverage badge, scorecard badge, or pre-v1 migration guide is introduced. The official CI badge and static MIT license badge are sufficient for the unreleased repository. Framework examples remain deferred until after the first core release.

## Consequences

- New users can scan the landing page and choose a task-specific documentation path.
- Recipes can grow without turning the README into a second API reference.
- Contributors have explicit locations and validation expectations for documentation changes.
- Broken relative file targets block local checks and pull requests without another dependency.
- Anchor correctness and external availability still require review.
- A documentation site or migration section may be reconsidered when releases and content volume justify their maintenance cost.
