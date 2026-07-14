import { describe, expect, it } from 'vitest';

import * as canvas from '../src/canvas.js';
import * as core from '../src/index.js';
import * as types from '../src/types.js';
import * as video from '../src/video.js';

describe('package entry points', () => {
  it.each([
    ['core', core],
    ['video', video],
    ['canvas', canvas],
    ['types', types],
  ])('imports the empty %s entry point without side effects', (_name, entryPoint) => {
    expect(Object.keys(entryPoint)).toEqual([]);
  });
});
