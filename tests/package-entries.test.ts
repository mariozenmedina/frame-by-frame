import { describe, expect, it } from 'vitest';

import * as canvas from '../src/canvas.js';
import * as core from '../src/index.js';
import * as types from '../src/types.js';
import * as video from '../src/video.js';

describe('package entry points', () => {
  it('exposes the pure timeline API from the core entry point', () => {
    expect(Object.keys(core).sort()).toEqual(['FrameByFrameError', 'createTimeline']);
  });

  it.each([
    ['video', video],
    ['canvas', canvas],
    ['types', types],
  ])('keeps the reserved %s entry point free of runtime exports', (_name, entryPoint) => {
    expect(Object.keys(entryPoint)).toEqual([]);
  });
});
