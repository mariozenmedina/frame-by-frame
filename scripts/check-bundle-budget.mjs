import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'dist');
const rootEntry = 'index.js';
const videoEntry = 'video.js';
const canvasEntry = 'canvas.js';
const rootBudget = 30 * 1024;
const canvasIncrementalBudget = 8 * 1024;
const importPatterns = [
  /(?:import|export)\s+(?:(?:[^'"]*?)\s+from\s+)?['"]([^'"]+)['"]/gu,
  /import\(\s*['"]([^'"]+)['"]\s*\)/gu,
];
const canvasMarkers = [
  'CanvasRenderer',
  'CanvasTargetRegistry',
  'calculateCanvasDrawPlan',
  'resolveCanvasTarget',
  'src/media/canvas-layout.ts',
  'src/media/canvas-renderer.ts',
  'src/media/canvas-target.ts',
];

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;

const moduleSpecifiers = (source) => {
  const specifiers = new Set();

  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];

      if (specifier !== undefined) {
        specifiers.add(specifier);
      }
    }
  }

  return specifiers;
};

const assertInsideOutput = (file) => {
  const pathFromOutput = relative(outputDirectory, file);

  if (pathFromOutput === '..' || pathFromOutput.startsWith(`..${sep}`)) {
    throw new Error(`Emitted import escapes the output directory: ${pathFromOutput}`);
  }
};

const collectGraph = (entry) => {
  const pending = [resolve(outputDirectory, entry)];
  const graph = new Set();

  while (pending.length > 0) {
    const file = pending.pop();

    if (file === undefined || graph.has(file)) {
      continue;
    }

    assertInsideOutput(file);

    if (!existsSync(file)) {
      throw new Error(`Expected emitted module is missing: ${relative(projectRoot, file)}`);
    }

    graph.add(file);
    const source = readFileSync(file, 'utf8');

    for (const specifier of moduleSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        throw new Error(
          `External runtime import is outside the bundle budget: ${specifier} in ${relative(projectRoot, file)}`,
        );
      }

      pending.push(resolve(dirname(file), specifier));
    }
  }

  return graph;
};

const gzipSize = (files) =>
  [...files].reduce(
    (total, file) => total + gzipSync(readFileSync(file), { level: 9 }).byteLength,
    0,
  );

const findCanvasLeaks = (entryName, graph) => {
  const leaks = [];

  for (const file of graph) {
    const source = readFileSync(file, 'utf8');

    for (const marker of canvasMarkers) {
      if (source.includes(marker)) {
        leaks.push(`${entryName}: ${relative(outputDirectory, file)} contains ${marker}`);
      }
    }
  }

  return leaks;
};

const rootGraph = collectGraph(rootEntry);
const videoGraph = collectGraph(videoEntry);
const canvasGraph = collectGraph(canvasEntry);
const canvasOnlyGraph = new Set([...canvasGraph].filter((file) => !rootGraph.has(file)));
const rootSize = gzipSize(rootGraph);
const canvasIncrementalSize = gzipSize(canvasOnlyGraph);
const failures = [...findCanvasLeaks('root', rootGraph), ...findCanvasLeaks('video', videoGraph)];

if (rootSize > rootBudget) {
  failures.push(`root runtime is ${formatKiB(rootSize)}; budget is ${formatKiB(rootBudget)}`);
}

if (canvasIncrementalSize > canvasIncrementalBudget) {
  failures.push(
    `incremental canvas runtime is ${formatKiB(canvasIncrementalSize)}; budget is ${formatKiB(canvasIncrementalBudget)}`,
  );
}

if (failures.length > 0) {
  throw new Error(`Bundle budget check failed:\n- ${failures.join('\n- ')}`);
}

stdout.write(
  [
    `Root runtime: ${formatKiB(rootSize)} / ${formatKiB(rootBudget)} (${rootGraph.size} modules)`,
    `Incremental canvas runtime: ${formatKiB(canvasIncrementalSize)} / ${formatKiB(canvasIncrementalBudget)} (${canvasOnlyGraph.size} modules)`,
    'Root and explicit video graphs contain no canvas implementation markers.',
  ].join('\n') + '\n',
);
