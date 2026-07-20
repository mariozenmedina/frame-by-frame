# Release maintainer guide

This guide is for maintainers of `@frame-by-frame/core`. Contributors do not need npm credentials and cannot publish through a pull request. The accepted policy and rationale live in [ADR 0012](../decisions/0012-v1-release-governance.md).

The repository is preparing `1.0.0-rc.1` through a draft version pull request. That branch may remove the private guard and use `YYYY-MM-DD` as an explicit changelog placeholder for review, but it must not merge, receive a tag, or enter the publication workflow until the real publication date and bootstrap are separately authorized. Publishable validation rejects the placeholder.

## Version and channel policy

| Version kind            | Git tag       | npm dist-tag | GitHub Release state |
| ----------------------- | ------------- | ------------ | -------------------- |
| First release candidate | `v1.0.0-rc.1` | `next`       | Prerelease           |
| Later v1 candidates     | `v1.0.0-rc.N` | `next`       | Prerelease           |
| Stable v1               | `v1.0.0`      | `latest`     | Latest release       |
| Stable patch            | `v1.0.PATCH`  | `latest`     | Latest release       |

Published versions and tags are immutable. Do not create a `0.x` publication, reuse a failed version, move a published tag, or assign a prerelease to `latest`.

## Gates shared by every publication

Before preparing a version pull request:

- confirm the intended release in a public issue;
- confirm that every included change is merged into `main` and required checks pass;
- keep the public API and compatibility claims aligned with the acceptance matrix;
- move the relevant `Unreleased` entries into a dated version section in [`CHANGELOG.md`](../../CHANGELOG.md);
- set the exact package version and remove the private guard in the version pull request;
- run `pnpm check`, `pnpm pack --dry-run`, and `git diff --check` without browser execution;
- inspect the dry-run archive for only the expected build, metadata, README, and license files;
- use npm CLI 11.15 or newer for staged-package review and approval; the workflow pins npm 11.18.0;
- confirm the npm organization, maintainer 2FA, and protected `npm` GitHub environment are available.

A release candidate may proceed with issue #25 still open only when its notes describe WebKit/macOS as unconfirmed. Stable `1.0.0` additionally requires every version 1 acceptance gate, including the recorded macOS evidence unless a later accepted decision changes that boundary.

## Create the release tag

Merge the focused version pull request first. From the updated and clean `main`, create an annotated signed tag whose value exactly matches `package.json`:

```sh
git switch main
git pull --ff-only
git tag -s v1.0.0-rc.1 -m "frame-by-frame v1.0.0-rc.1"
git push origin v1.0.0-rc.1
```

Replace the version for later releases. Confirm GitHub shows the tag signature as verified before dispatching publication. Merely pushing a tag does not contact npm.

## Bootstrap the first npm version

npm trusted publishing and staged publishing require an existing registry package. The first release candidate therefore uses a one-time bootstrap:

1. Create a short-lived granular npm token with these exact boundaries:
   - name it `frame-by-frame-rc1-bootstrap`;
   - enable **Bypass 2FA** for the non-interactive GitHub Actions publish;
   - under **Packages and scopes**, grant **Read and write** to only the `@frame-by-frame` scope;
   - leave **Organizations** at **No access**, because organization permissions manage organization settings and do not grant package publication rights;
   - use the minimum available expiration of one day and do not add an IP range, because GitHub-hosted runner addresses are not fixed for this workflow.
2. Add it temporarily as `NPM_BOOTSTRAP_TOKEN` in the protected GitHub `npm` environment. Never place it in repository, issue, pull-request, command output, or artifact content.
3. Dispatch **Stage npm package** against the signed tag. The ref and input must be identical so the workflow identity, checkout, and provenance resolve to one commit:

   ```sh
   gh workflow run publish.yml --repo mariozenmedina/frame-by-frame --ref v1.0.0-rc.1 -f release_tag=v1.0.0-rc.1 -f npm_tag=next -f operation=bootstrap
   ```

   The GitHub CLI accepts a branch or tag in `--ref`; do not dispatch this workflow from `main`.

4. Approve the protected-environment deployment and wait for all validation and the provenance-enabled publish to succeed.
5. Verify the registry version as described below before creating the GitHub prerelease.
6. In npm package settings, configure a GitHub Actions trusted publisher for `mariozenmedina/frame-by-frame`, workflow `publish.yml`, environment `npm`, allowing only staged publication.
7. Require 2FA and disallow traditional publish tokens for the package.
8. Delete the GitHub environment secret and revoke the bootstrap token.

The bootstrap operation must never be used after this migration. Without its temporary secret it fails closed.

## Stage subsequent versions

For every version after the bootstrap:

1. Push and verify the signed release tag.
2. Dispatch **Stage npm package** against that tag, supplying the same tag as input, the correct dist-tag, and operation `stage`:

   ```sh
   gh workflow run publish.yml --repo mariozenmedina/frame-by-frame --ref v1.0.0 -f release_tag=v1.0.0 -f npm_tag=latest -f operation=stage
   ```

3. Approve the protected GitHub environment. The workflow uses npm trusted publishing through OIDC and retains no npm token.
4. Review the staged package before approval:

   ```sh
   npm stage list @frame-by-frame/core
   npm stage view <stage-id>
   npm stage download <stage-id>
   ```

5. Inspect the downloaded archive, then approve with account 2FA:

   ```sh
   npm stage approve <stage-id>
   ```

If any check is wrong, use `npm stage reject <stage-id>` instead and prepare a new version if the tagged package content must change.

## Verify publication and create the GitHub Release

After npm makes the version public, verify the exact version, dist-tag, integrity, and provenance on npmjs.com and with registry metadata:

```sh
npm view @frame-by-frame/core@1.0.0-rc.1 version dist.integrity dist.tarball --json
npm dist-tag ls @frame-by-frame/core
```

Install the exact version into an empty consumer project and import every documented package entry. Only then create the GitHub Release from the existing signed tag. Copy the matching changelog section, link the acceptance evidence and known limitations, and mark release candidates as prereleases.

## Recovery and rollback

- **Before npm approval:** reject the staged package. The version remains available for a corrected tag only if it was never published; prefer incrementing the prerelease when package content changed.
- **Workflow failed before publication:** diagnose and rerun only when the tagged package content is unchanged. Otherwise create a new version and tag.
- **Published package is defective:** deprecate the affected version with a useful migration message, move an incorrect dist-tag if necessary, and publish a new patch or prerelease.
- **Security incident:** follow [`SECURITY.md`](../../SECURITY.md) and npm support guidance. Unpublishing is exceptional and is not a normal rollback mechanism.
- **GitHub Release is wrong:** edit its notes or mark it clearly, but never retarget the published version tag.

Record the incident and resolution in the changelog and release issue so consumers do not need to reconstruct recovery from commit history.
