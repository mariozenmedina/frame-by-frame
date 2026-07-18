import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import process, { env, stderr, stdout } from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicRoots = [
  resolve(projectRoot, 'dist'),
  resolve(projectRoot, 'tests', 'browser', 'fixtures'),
];
const host = '127.0.0.1';
const port = Number.parseInt(env.PORT ?? '4173', 10);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
]);

const isInsideProject = (file) => {
  return publicRoots.some((publicRoot) => {
    const pathFromRoot = relative(publicRoot, file);
    return pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`);
  });
};

const resolveRequest = (pathname) => {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedPath = decodedPath === '/' ? '/tests/browser/fixtures/index.html' : decodedPath;
  const file = resolve(projectRoot, requestedPath.slice(1));

  return isInsideProject(file) ? file : null;
};

const parseRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header);

  if (match === null) {
    return null;
  }

  const [, rawStart = '', rawEnd = ''] = match;

  if (rawStart === '' && rawEnd === '') {
    return null;
  }

  if (rawStart === '') {
    const suffixLength = Number.parseInt(rawEnd, 10);

    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  const parsedEnd = rawEnd === '' ? size - 1 : Number.parseInt(rawEnd, 10);
  const end = Math.min(parsedEnd, size - 1);

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    return null;
  }

  return { start, end };
};

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);

  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  const file = resolveRequest(requestUrl.pathname);

  if (file === null) {
    response.writeHead(400);
    response.end('Invalid path');
    return;
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const size = statSync(file).size;
  const contentType = contentTypes.get(extname(file).toLowerCase()) ?? 'application/octet-stream';
  const rangeHeader = request.headers.range;
  const range = rangeHeader === undefined ? null : parseRange(rangeHeader, size);

  if (rangeHeader !== undefined && range === null) {
    response.writeHead(416, { 'Content-Range': `bytes */${size}` });
    response.end();
    return;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Length': String(end - start + 1),
    'Content-Type': contentType,
    ...(range === null ? {} : { 'Content-Range': `bytes ${start}-${end}/${size}` }),
  };
  const send = () => {
    if (response.destroyed) {
      return;
    }

    response.writeHead(range === null ? 200 : 206, headers);

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = createReadStream(file, { start, end });
    stream.on('error', (error) => {
      stderr.write(`${error.stack ?? error.message}\n`);
      response.destroy(error);
    });
    stream.pipe(response);
  };

  if (requestUrl.searchParams.get('slow') === '1') {
    const timer = setTimeout(send, 5_000);
    response.on('close', () => clearTimeout(timer));
  } else {
    send();
  }
});

server.listen(port, host, () => {
  stdout.write(`Browser fixture server listening at http://${host}:${port}\n`);
});

const shutdown = () => {
  server.close((error) => {
    if (error !== undefined) {
      stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    }
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
