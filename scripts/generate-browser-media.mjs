import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process, { stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'tests', 'browser', 'fixtures', 'media');
const image =
  'jrottenberg/ffmpeg@sha256:8ec1ee1f6a0fcd37c97725827b6b7832795c9596e3439b8da56d7700d61ae778';
const expectedDigests = new Map([
  ['primary.webm', '4cb56245d8519978775aaec99a931c50fad87a8ffb9d5935652f2f5d688562a6'],
  ['primary.mp4', '9c9172d9e280a968b3752bb28e43ce798d033d6d225ad8d652dd776bba2dd6e4'],
  ['accent.webm', '5c3ef9d1182b8e2b042d39b9ae3c93d24bc77f515249c4c5ddf0411edb1a6a57'],
  ['accent.mp4', 'f7cbec2306006c3570be87ab0f04e8e331c33a248b07e6d5f550693781c4dd87'],
]);
const sources = new Map([
  ['primary', 'testsrc2=size=160x90:rate=12'],
  ['accent', 'testsrc2=size=160x90:rate=12,hue=h=120'],
]);
const commonArguments = [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  null,
  '-bitexact',
  '-map',
  '0:v:0',
  '-frames:v',
  '12',
  '-an',
  '-map_metadata',
  '-1',
  '-pix_fmt',
  'yuv420p',
  '-threads',
  '1',
  '-flags:v',
  '+bitexact',
];
const encodings = new Map([
  [
    'webm',
    [
      '-c:v',
      'libvpx',
      '-deadline',
      'best',
      '-cpu-used',
      '0',
      '-crf',
      '30',
      '-b:v',
      '0',
      '-g',
      '1',
      '-row-mt',
      '0',
      '-f',
      'webm',
    ],
  ],
  [
    'mp4',
    [
      '-c:v',
      'libx264',
      '-profile:v',
      'baseline',
      '-preset',
      'veryslow',
      '-crf',
      '28',
      '-g',
      '1',
      '-keyint_min',
      '1',
      '-sc_threshold',
      '0',
      '-movflags',
      '+faststart',
      '-video_track_timescale',
      '12000',
      '-f',
      'mp4',
    ],
  ],
]);

mkdirSync(outputDirectory, { recursive: true });

const generated = [];

try {
  for (const [name, source] of sources) {
    for (const [extension, encodingArguments] of encodings) {
      const filename = `${name}.${extension}`;
      const temporaryFilename = `${filename}.tmp`;
      const inputArguments = commonArguments.map((argument) =>
        argument === null ? source : argument,
      );
      const result = spawnSync(
        'docker',
        [
          'run',
          '--rm',
          '--network',
          'none',
          '--platform',
          'linux/amd64',
          '--mount',
          `type=bind,source=${outputDirectory},target=/output`,
          image,
          ...inputArguments,
          ...encodingArguments,
          `/output/${temporaryFilename}`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );

      if (result.status !== 0) {
        throw new Error(
          `FFmpeg failed for ${filename}:\n${result.stderr || result.stdout || 'Unknown Docker error'}`,
        );
      }

      const temporaryPath = resolve(outputDirectory, temporaryFilename);
      const outputPath = resolve(outputDirectory, filename);
      const digest = createHash('sha256').update(readFileSync(temporaryPath)).digest('hex');

      const expectedDigest = expectedDigests.get(filename);

      if (expectedDigest !== undefined && digest !== expectedDigest) {
        throw new Error(`Unexpected SHA-256 for ${filename}: ${digest}`);
      }

      generated.push({ filename, temporaryPath, outputPath, digest });
    }
  }

  for (const { temporaryPath, outputPath } of generated) {
    rmSync(outputPath, { force: true });
    renameSync(temporaryPath, outputPath);
  }
} catch (error) {
  for (const name of sources.keys()) {
    for (const extension of encodings.keys()) {
      rmSync(resolve(outputDirectory, `${name}.${extension}.tmp`), { force: true });
    }
  }

  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

if (process.exitCode === undefined) {
  for (const { outputPath, digest } of generated) {
    stdout.write(`${outputPath.slice(projectRoot.length + 1)}  ${digest}\n`);
  }
}
