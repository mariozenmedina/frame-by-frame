# 0001. Package foundation

- Status: Accepted
- Date: 2026-07-14

## Context

Version 1 has one publishable artifact: a framework-agnostic TypeScript core. Framework integrations will begin as examples only after the first core release. The package must be safe to import during SSR, tree-shakeable, and free of runtime dependencies.

## Decision

- Keep the package at the repository root and publish it as `@frame-by-frame/core`.
- Publish ESM only, with declarations and source maps.
- Reserve explicit entry points for the core, video renderer, canvas renderer, and public types.
- Keep the package private at version `0.0.0` until the release process is approved.
- Target Node.js 22.18+ and 24.11+ for tooling and SSR import validation.
- Target Baseline Widely Available browsers without shipping global polyfills.
- Use pnpm, strict TypeScript, tsdown, Vitest, ESLint with typed rules, and Prettier.
- Validate package metadata and declarations with publint and Are the Types Wrong during the build.
- Keep runtime dependencies at zero unless a later public decision demonstrates a clear need.

## Consequences

The repository stays simple while there is only one package. A workspace can be introduced when `examples/vue` is added. ESM-only publishing reduces output and maintenance, but consumers must use an ESM-capable toolchain. Optional browser APIs require feature detection and documented fallbacks.
