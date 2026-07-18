# Contributing to frame-by-frame

Thank you for considering a contribution. `frame-by-frame` is built as a focused, framework-agnostic core with public design rationale and a low-friction contribution model.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- Use the [documentation map](docs/README.md) and search existing issues and pull requests.
- Use the provided issue forms for bugs and feature proposals.
- Follow [SECURITY.md](SECURITY.md) for vulnerabilities and the private instructions in the Code of Conduct for sensitive conduct reports.
- Keep project communication, code, tests, commit messages, and public documentation in English.

## Project scope

Contributions should support deterministic scroll-to-video mapping, predictable lifecycle behavior, bounded browser work, strong TypeScript contracts, accessibility, and framework independence.

The core must not gain a runtime dependency on Vue, React, or another frontend framework. Framework integrations will live under `examples/` after the first core release. Vue will be the first maintained example; other framework examples will be open to pull requests once the example contract is documented.

The project is not a general-purpose video player, encoder, streaming implementation, scroll hijacker, or guarantee of exact frame presentation for every codec and browser.

## Propose significant changes first

Open an issue before investing in a change that affects:

- public API or TypeScript types;
- package exports or browser compatibility;
- lifecycle, scheduling, or cleanup guarantees;
- loading, caching, or renderer ownership;
- accessibility defaults;
- bundle budgets or required repository gates;
- version 1 scope.

Describe the problem, observable behavior, alternatives, trade-offs, and compatibility impact. Wait for accepted direction before implementation. Small documentation corrections and clearly scoped test improvements may go directly to a pull request.

## Repository map

| Path              | Responsibility                                                    |
| ----------------- | ----------------------------------------------------------------- |
| `src/core/`       | Controller lifecycle, configuration, state, and events            |
| `src/mapping/`    | Pure deterministic scroll-to-time mapping                         |
| `src/media/`      | Native video, loading/cache, targets, and opt-in canvas rendering |
| `src/responsive/` | Media-query, resize, visibility, and preference observation       |
| `src/scroll/`     | Scroll-source resolution and shared frame scheduling              |
| `tests/`          | Runtime, package, performance-invariant, and public type tests    |
| `docs/api/`       | Exact public contracts                                            |
| `docs/recipes/`   | Focused integration patterns                                      |
| `docs/guides/`    | Operational and product guidance                                  |
| `docs/decisions/` | Accepted architecture decisions                                   |
| `scripts/`        | Dependency-free repository validation                             |
| `.github/`        | CI, security automation, and contribution templates               |

Private maintainer planning is intentionally outside the public repository contract.

## Development workflow

Use Node.js 24 LTS and pnpm 11. CI also validates the supported Node.js 22 line.

```sh
pnpm install
pnpm check
```

`pnpm check` is the required local gate. Use focused commands while iterating:

| Change                                      | Minimum focused validation before `pnpm check`          |
| ------------------------------------------- | ------------------------------------------------------- |
| Markdown or contribution templates          | `pnpm format:check` and `pnpm check:docs`               |
| Runtime behavior                            | `pnpm test:run`, `pnpm typecheck`, and `pnpm lint`      |
| Public types or entries                     | `pnpm typecheck`, `pnpm build`, and `pnpm test:package` |
| Performance-sensitive or renderer isolation | `pnpm test:coverage` and `pnpm check:bundle`            |
| Package metadata or emitted output          | `pnpm build` and `pnpm test:package`                    |

Formatting fixes may be applied with `pnpm format`. Browser validation is an explicit operator task; contributors should document manual environments and results when a change depends on real media behavior.

The prepared browser suite is intentionally outside `pnpm check` and CI. Only the operator installs browser binaries and runs `pnpm test:browser`; see the [browser validation runbook](docs/guides/browser-support.md). Contributors may use Node gates to type-check and lint browser-suite changes, but must not report those gates as browser results.

## Tests and compatibility

Every implementation pull request should:

- include focused tests for new or changed behavior;
- preserve SSR-safe imports and framework independence;
- cover cleanup and failure paths for newly owned resources;
- use deterministic assertions instead of machine-specific elapsed-time or FPS thresholds;
- update public types and type tests together;
- avoid unrelated refactors.

Do not weaken coverage, bundle, dependency, or code-scanning gates to make a change pass. A threshold change requires public rationale and maintainer agreement.

## Documentation standards

Update documentation in the same pull request whenever observable behavior changes.

- Keep the root README concise; add task-oriented detail to `docs/`.
- Put copyable integration patterns in `docs/recipes/`, operational advice in `docs/guides/`, and exact behavior in `docs/api/`.
- Record durable architectural trade-offs in `docs/decisions/` with the next numbered ADR.
- Use relative links for files inside the repository and run `pnpm check:docs`.
- Use tested names and defaults. Clearly label unreleased, pending, approximate, or browser-dependent behavior.
- Do not promise performance numbers, exact frame presentation, browser support, or release availability without accepted evidence.

## Pull requests

Keep each pull request small enough to review. Complete the template, link its issue when applicable, explain the user-visible outcome, list validation commands, and call out compatibility, accessibility, performance, loading, and cleanup impact.

Maintainers may request changes, ask for a proposal to be split, or decline work outside the project scope. Significant decisions include a public rationale under the [governance model](GOVERNANCE.md).

## Licensing contributions

This project uses the MIT License. By submitting a contribution, you agree that it may be distributed under the same license. The project does not currently require a Contributor License Agreement or Developer Certificate of Origin sign-off.
