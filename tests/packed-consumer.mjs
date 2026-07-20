import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { env, execPath, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmEntry = env.npm_execpath;
const sourcePackageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
const packageName = sourcePackageJson.name;
const packageVersion = sourcePackageJson.version;

if (pnpmEntry === undefined) {
  throw new Error('Run this check through pnpm test:package.');
}

const runPnpm = (args, cwd) => {
  execFileSync(execPath, [pnpmEntry, ...args], {
    cwd,
    env: { ...env, CI: 'true' },
    stdio: 'pipe',
  });
};

const consumerCheck = `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [core, video, canvas, types] = await Promise.all([
  import('${packageName}'),
  import('${packageName}/video'),
  import('${packageName}/canvas'),
  import('${packageName}/types'),
]);

assert.equal(typeof core.createTimeline, 'function');
assert.equal(typeof core.createFrameByFrame, 'function');
assert.equal(typeof core.FrameByFrameError, 'function');
assert.equal(video.createTimeline, core.createTimeline);
assert.equal(video.createFrameByFrame, core.createFrameByFrame);
assert.equal(video.FrameByFrameError, core.FrameByFrameError);
assert.equal(typeof canvas.createTimeline, 'function');
assert.equal(typeof canvas.createFrameByFrame, 'function');
assert.equal(typeof canvas.FrameByFrameError, 'function');
assert.deepEqual(Object.keys(types), []);

const packageJson = JSON.parse(
  await readFile(new URL('./node_modules/${packageName}/package.json', import.meta.url), 'utf8'),
);

assert.equal(packageJson.name, '${packageName}');
assert.equal(packageJson.version, '${packageVersion}');
assert.equal(packageJson.type, 'module');
assert.equal(packageJson.private, undefined);
`;

const temporaryRoot = await mkdtemp(join(tmpdir(), 'frame-by-frame-package-'));
const packDirectory = join(temporaryRoot, 'pack');
const consumerDirectory = join(temporaryRoot, 'consumer');

try {
  await Promise.all([mkdir(packDirectory), mkdir(consumerDirectory)]);

  await Promise.all([
    writeFile(join(consumerDirectory, 'consumer-check.mjs'), consumerCheck.trimStart(), 'utf8'),
    writeFile(
      join(consumerDirectory, 'package.json'),
      `${JSON.stringify({ name: 'frame-by-frame-packed-consumer', private: true, type: 'module' }, null, 2)}\n`,
      'utf8',
    ),
  ]);

  runPnpm(['pack', '--pack-destination', packDirectory], projectRoot);

  const tarballs = (await readdir(packDirectory)).filter((entry) => entry.endsWith('.tgz'));
  assert.equal(tarballs.length, 1);

  runPnpm(
    ['add', '--offline', '--ignore-scripts', '--save-exact', join(packDirectory, tarballs[0])],
    consumerDirectory,
  );

  execFileSync(execPath, [join(consumerDirectory, 'consumer-check.mjs')], {
    cwd: consumerDirectory,
    stdio: 'pipe',
  });

  stdout.write(`Packed consumer imports valid for ${packageName}@${packageVersion}.\n`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
