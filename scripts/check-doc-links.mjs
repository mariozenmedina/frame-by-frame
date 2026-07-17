import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recursiveRoots = [resolve(projectRoot, 'docs'), resolve(projectRoot, '.github')];
const inlineLinkPattern = /!?\[[^\]]*\]\((?<target><[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/gu;
const referenceLinkPattern = /^\[[^\]]+\]:\s*(?<target><[^>]+>|\S+)/gmu;

const collectMarkdown = (directory) => {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectMarkdown(entryPath));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(entryPath);
    }
  }

  return files;
};

const rootMarkdown = readdirSync(projectRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
  .map((entry) => resolve(projectRoot, entry.name));
const markdownFiles = [...rootMarkdown, ...recursiveRoots.flatMap(collectMarkdown)].sort();
const failures = [];
let checkedLinks = 0;

const isOutsideProject = (path) => {
  const pathFromRoot = relative(projectRoot, path);
  return pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`);
};

const checkTarget = (sourceFile, rawTarget) => {
  const target =
    rawTarget.startsWith('<') && rawTarget.endsWith('>') ? rawTarget.slice(1, -1) : rawTarget;

  if (
    target === '' ||
    target.startsWith('#') ||
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  ) {
    return;
  }

  checkedLinks += 1;

  if (target.startsWith('/')) {
    failures.push(
      `${relative(projectRoot, sourceFile)}: repository link must be relative: ${target}`,
    );
    return;
  }

  const pathPart = target.split(/[?#]/u, 1)[0];

  if (pathPart === undefined || pathPart === '') {
    return;
  }

  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathPart);
  } catch {
    failures.push(`${relative(projectRoot, sourceFile)}: invalid URL encoding: ${target}`);
    return;
  }

  const destination = resolve(dirname(sourceFile), decodedPath);

  if (isOutsideProject(destination)) {
    failures.push(`${relative(projectRoot, sourceFile)}: link escapes the repository: ${target}`);
  } else if (!existsSync(destination)) {
    failures.push(`${relative(projectRoot, sourceFile)}: missing link target: ${target}`);
  }
};

for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');

  for (const pattern of [inlineLinkPattern, referenceLinkPattern]) {
    for (const match of source.matchAll(pattern)) {
      const target = match.groups?.target;

      if (target !== undefined) {
        checkTarget(file, target);
      }
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Documentation link check failed:\n- ${failures.join('\n- ')}`);
}

stdout.write(
  `Checked ${checkedLinks} relative links across ${markdownFiles.length} Markdown files.\n`,
);
