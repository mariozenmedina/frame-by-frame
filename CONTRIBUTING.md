# Contributing to frame-by-frame

Thank you for considering a contribution. `frame-by-frame` is being built as a focused, framework-agnostic core with a public design process and a low-friction contribution model.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- Search existing issues and pull requests before opening a new one.
- Use the provided issue forms for bugs and feature proposals.
- Do not disclose security vulnerabilities or sensitive conduct reports in a public issue. Follow [SECURITY.md](SECURITY.md) or the private reporting instructions in the [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep public project communication, code, tests, and documentation in English.

## What belongs in the project

Contributions should support the core goals: deterministic scroll-to-video mapping, predictable lifecycle behavior, efficient browser scheduling, strong TypeScript contracts, accessibility, and framework independence.

The core must not gain a runtime dependency on Vue, React, or another frontend framework. Framework integrations live under `examples/` after the first core release. Vue will be the first maintained example; examples for other frameworks are welcome through pull requests once the example contract is documented.

## Proposing a change

Open an issue before investing in a large change when it affects any of the following:

- the public API or TypeScript types;
- package exports or compatibility;
- lifecycle, scheduling, or cleanup guarantees;
- loading and caching behavior;
- renderer boundaries;
- accessibility defaults;
- the scope of version 1.

Describe the problem first, then the proposed behavior, alternatives, trade-offs, and any compatibility impact. Small documentation corrections can go directly to a pull request.

## Development workflow

Use Node.js 24 LTS and pnpm 11 for local development. The minimum validated Node.js lines are 22.18 and 24.11.

```sh
pnpm install
pnpm check
```

Useful focused commands:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

`pnpm check` is the required local quality gate. It checks formatting, typed lint rules, TypeScript, unit tests, the ESM build, package metadata, and declaration compatibility.

Every implementation pull request is expected to:

- include focused tests for new or changed behavior;
- update public documentation when behavior changes;
- preserve SSR-safe imports and framework independence;
- avoid unrelated refactors;
- pass the repository's documented quality checks.

## Pull requests

Keep pull requests small enough to review and explain why the change is needed. Complete the pull request template, link related issues, describe validation, and call out breaking or performance-sensitive behavior.

Maintainers may request changes, split a proposal, or decline work that does not fit the project scope. Significant decisions should include a public rationale. See [GOVERNANCE.md](GOVERNANCE.md) for the decision process.

## Licensing contributions

This project uses the MIT License. By submitting a contribution, you agree that your contribution may be distributed under the same license. The project does not currently require a Contributor License Agreement or Developer Certificate of Origin sign-off.
