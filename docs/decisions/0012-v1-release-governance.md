# ADR 0012: Stage version 1 releases behind explicit approval

- Status: Accepted
- Date: 2026-07-18

## Context

The version 1 runtime contract is frozen and the package passes deterministic Node, package, bundle, security, and partial operator-browser gates. The repository still needs a release process that is reproducible for users, understandable to contributors, resistant to accidental publication, and usable by a small maintainer team. The first npm publication has a special trust bootstrap: npm trusted publishing can only be configured after the package already exists in the registry.

WebKit media evidence on macOS remains open in issue #25. That environmental result should not block release-process preparation, but it must not be silently converted into a complete WebKit claim or stable-release approval.

## Decision

The project uses Semantic Versioning and will not publish a `0.x` line. The first public candidate is `1.0.0-rc.1` under the npm `next` dist-tag. Stable `1.0.0` and later stable versions use `latest`. Additional alpha or beta channels require a separate editorial decision.

`CHANGELOG.md` is the human-curated source for user-visible release notes. Changesets and release-PR automation are deferred while the repository contains one package and one active maintainer. Every version uses an annotated, signed `vX.Y.Z` tag whose version matches `package.json`; published tags and npm versions are never moved or reused.

Release work is split into three reviewable boundaries:

1. preparation adds policy, validation, and inert automation while `package.json` remains `private` at `0.0.0`;
2. an explicitly authorized release-candidate change removes the private guard, records `1.0.0-rc.1`, and performs the one-time registry bootstrap;
3. stable promotion occurs only after the release-candidate and version 1 gates are complete, including the separately tracked WebKit/macOS boundary unless a later public decision changes it.

Publication is manually dispatched against an existing signed tag and uses a protected GitHub `npm` environment. The workflow checks out that tag, requires it to be annotated and reachable from `main`, validates package version, channel, metadata, and changelog alignment, runs all non-browser repository gates, and inspects the package archive before contacting npm. Actions are pinned by commit and the job has only `contents: read` and `id-token: write` permissions.

The first candidate is a documented exception because the npm package does not yet exist. It uses a temporary granular npm token from the protected environment to publish with provenance. Immediately afterward, the token and secret are removed, the package is connected to the exact GitHub workflow and environment as an npm trusted publisher, only `npm stage publish` is allowed, and traditional publish tokens are disabled.

Subsequent versions use OIDC to stage rather than directly publish. A maintainer reviews the staged metadata and tarball and approves it with npm account 2FA. A GitHub Release is created from the same tag only after the registry version, integrity, dist-tag, and provenance are verified.

Before staged approval, a bad candidate is rejected. After publication, recovery uses deprecation, dist-tag correction, and a new patch or prerelease version; ordinary rollback never unpublishes a version or rewrites its Git tag.

## Consequences

- Preparing automation cannot publish the current private placeholder package.
- The first candidate has an auditable, temporary credential boundary; later releases do not retain an npm write token in GitHub.
- Publishing requires separate Git tag, protected-environment, and npm 2FA decisions instead of occurring on every merge or tag push.
- Release notes remain editorially useful without requiring every contribution to carry release-tool metadata.
- The single-package process stays small, while Changesets or release-PR automation can be reconsidered if package count or contributor volume grows.
- A release candidate may gather installation feedback while macOS evidence remains pending, but stable `1.0.0` and complete WebKit claims remain gated.
