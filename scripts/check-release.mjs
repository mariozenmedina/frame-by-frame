import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { argv, stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageName = '@frame-by-frame/core';
const repositoryUrls = new Set([
  'git+https://github.com/mariozenmedina/frame-by-frame.git',
  'https://github.com/mariozenmedina/frame-by-frame.git',
]);
const semverPattern =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+(?<build>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

const parseSemver = (version) => {
  const match = semverPattern.exec(version);

  if (match === null || match.groups === undefined) {
    return undefined;
  }

  const prerelease = match.groups.prerelease;

  if (
    prerelease !== undefined &&
    prerelease.split('.').some((identifier) => /^0\d+$/u.test(identifier))
  ) {
    return undefined;
  }

  return {
    build: match.groups.build,
    major: Number(match.groups.major),
    prerelease,
  };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const validateReleaseContract = ({
  packageJson,
  changelog,
  publishable = false,
  tag,
  channel,
}) => {
  const failures = [];
  const version = typeof packageJson.version === 'string' ? packageJson.version : '';
  const parsedVersion = parseSemver(version);
  const repositoryUrl =
    typeof packageJson.repository === 'string'
      ? packageJson.repository
      : packageJson.repository?.url;

  if (packageJson.name !== packageName) {
    failures.push(`package name must remain ${packageName}`);
  }

  if (parsedVersion === undefined) {
    failures.push('package version must be strict Semantic Versioning');
  }

  if (version === '0.0.0' && packageJson.private !== true) {
    failures.push('placeholder version 0.0.0 must remain private');
  }

  if (packageJson.license !== 'MIT') {
    failures.push('package license must remain MIT');
  }

  if (!repositoryUrls.has(repositoryUrl)) {
    failures.push('package repository must match mariozenmedina/frame-by-frame');
  }

  if (packageJson.publishConfig?.access !== 'public') {
    failures.push('publishConfig.access must be public');
  }

  if (packageJson.publishConfig?.provenance !== true) {
    failures.push('publishConfig.provenance must be enabled');
  }

  if (!changelog.startsWith('# Changelog\n') || !changelog.includes('## [Unreleased]')) {
    failures.push('CHANGELOG.md must retain its title and Unreleased section');
  }

  if (!publishable) {
    return failures;
  }

  if (packageJson.private === true) {
    failures.push('publishable package must not be private');
  }

  if (parsedVersion !== undefined) {
    if (parsedVersion.major === 0) {
      failures.push('publishable versions must not use the 0.x line');
    }

    if (parsedVersion.build !== undefined) {
      failures.push('publishable versions must not contain build metadata');
    }

    const expectedTag = `v${version}`;

    if (tag !== expectedTag) {
      failures.push(`release tag must exactly equal ${expectedTag}`);
    }

    const expectedChannel = parsedVersion.prerelease === undefined ? 'latest' : 'next';

    if (channel !== expectedChannel) {
      failures.push(`${version} must use the npm dist-tag ${expectedChannel}`);
    }

    const releaseHeadingPattern = new RegExp(
      `^## \\[${escapeRegex(version)}\\] - \\d{4}-\\d{2}-\\d{2}$`,
      'mu',
    );

    if (!releaseHeadingPattern.test(changelog)) {
      failures.push(`CHANGELOG.md must contain a dated ${version} release heading`);
    }
  }

  return failures;
};

/* v8 ignore start -- the exported contract is tested; this block is CLI wiring. */
const invokedPath = argv[1];
const isCommand =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

if (isCommand) {
  const { values } = parseArgs({
    options: {
      channel: { type: 'string' },
      publishable: { type: 'boolean', default: false },
      tag: { type: 'string' },
    },
    strict: true,
  });
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
  const changelog = readFileSync(resolve(projectRoot, 'CHANGELOG.md'), 'utf8');
  const failures = validateReleaseContract({
    packageJson,
    changelog,
    publishable: values.publishable,
    tag: values.tag,
    channel: values.channel,
  });

  if (failures.length > 0) {
    throw new Error(`Release contract check failed:\n- ${failures.join('\n- ')}`);
  }

  const state = values.publishable ? 'publishable release' : 'private preparation';
  stdout.write(
    `Release contract valid for ${state}: ${packageJson.name}@${packageJson.version}.\n`,
  );
}
/* v8 ignore stop */
