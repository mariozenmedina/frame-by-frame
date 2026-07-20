import { describe, expect, it } from 'vitest';

import { validateReleaseContract, type ReleasePackageJson } from '../scripts/check-release.mjs';

const basePackage = (): ReleasePackageJson => ({
  name: '@frame-by-frame/core',
  version: '0.0.0',
  private: true,
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'git+https://github.com/mariozenmedina/frame-by-frame.git',
  },
  publishConfig: {
    access: 'public',
    provenance: true,
  },
});

const unreleasedChangelog = '# Changelog\n\n## [Unreleased]\n';

describe('release contract validation', () => {
  it('accepts the guarded private preparation state', () => {
    expect(
      validateReleaseContract({
        packageJson: basePackage(),
        changelog: unreleasedChangelog,
      }),
    ).toEqual([]);
  });

  it('rejects an unguarded placeholder and invalid package metadata', () => {
    const failures = validateReleaseContract({
      packageJson: {
        ...basePackage(),
        name: 'frame-by-frame',
        private: false,
        license: 'ISC',
        repository: 'https://example.com/repository.git',
        publishConfig: { access: 'restricted', provenance: false },
      },
      changelog: 'Missing release history',
    });

    expect(failures).toEqual([
      'package name must remain @frame-by-frame/core',
      'placeholder version 0.0.0 must remain private',
      'package license must remain MIT',
      'package repository must match mariozenmedina/frame-by-frame',
      'publishConfig.access must be public',
      'publishConfig.provenance must be enabled',
      'CHANGELOG.md must retain its title and Unreleased section',
    ]);
  });

  it('accepts a release candidate aligned with its tag, channel, and changelog', () => {
    expect(
      validateReleaseContract({
        packageJson: {
          ...basePackage(),
          version: '1.0.0-rc.1',
          private: false,
        },
        changelog: `${unreleasedChangelog}\n## [1.0.0-rc.1] - 2026-07-18\n`,
        publishable: true,
        tag: 'v1.0.0-rc.1',
        channel: 'next',
      }),
    ).toEqual([]);
  });

  it('rejects private, mismatched, and incomplete prerelease metadata', () => {
    const failures = validateReleaseContract({
      packageJson: {
        ...basePackage(),
        version: '1.0.0-rc.1',
      },
      changelog: unreleasedChangelog,
      publishable: true,
      tag: 'v1.0.0',
      channel: 'latest',
    });

    expect(failures).toEqual([
      'publishable package must not be private',
      'release tag must exactly equal v1.0.0-rc.1',
      '1.0.0-rc.1 must use the npm dist-tag next',
      'CHANGELOG.md must contain a dated 1.0.0-rc.1 release heading',
    ]);
  });

  it('rejects a release-candidate publication-date placeholder', () => {
    const failures = validateReleaseContract({
      packageJson: {
        ...basePackage(),
        version: '1.0.0-rc.1',
        private: false,
      },
      changelog: `${unreleasedChangelog}\n## [1.0.0-rc.1] - YYYY-MM-DD\n`,
      publishable: true,
      tag: 'v1.0.0-rc.1',
      channel: 'next',
    });

    expect(failures).toEqual([
      'CHANGELOG.md must replace the 1.0.0-rc.1 publication-date placeholder',
    ]);
  });

  it('requires stable releases to use latest and rejects the 0.x line', () => {
    const failures = validateReleaseContract({
      packageJson: {
        ...basePackage(),
        version: '0.1.0',
        private: false,
      },
      changelog: `${unreleasedChangelog}\n## [0.1.0] - 2026-07-18\n`,
      publishable: true,
      tag: 'v0.1.0',
      channel: 'next',
    });

    expect(failures).toEqual([
      'publishable versions must not use the 0.x line',
      '0.1.0 must use the npm dist-tag latest',
    ]);
  });

  it('rejects invalid SemVer and build metadata on publication', () => {
    const invalidVersionFailures = validateReleaseContract({
      packageJson: { ...basePackage(), version: '1.0.0-rc.01', private: false },
      changelog: unreleasedChangelog,
      publishable: true,
      tag: 'v1.0.0-rc.01',
      channel: 'next',
    });
    const buildFailures = validateReleaseContract({
      packageJson: { ...basePackage(), version: '1.0.0+build.1', private: false },
      changelog: `${unreleasedChangelog}\n## [1.0.0+build.1] - 2026-07-18\n`,
      publishable: true,
      tag: 'v1.0.0+build.1',
      channel: 'latest',
    });

    expect(invalidVersionFailures).toEqual(['package version must be strict Semantic Versioning']);
    expect(buildFailures).toEqual(['publishable versions must not contain build metadata']);
  });
});
