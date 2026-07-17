import { describe, expect, it } from 'vitest';

import { calculateCanvasDrawPlan } from '../src/media/canvas-layout.js';

describe('canvas draw layout', () => {
  it('contains the complete frame with centered letterboxing', () => {
    expect(calculateCanvasDrawPlan(1920, 1080, 300, 300, 'contain', 1)).toEqual({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1920,
      sourceHeight: 1080,
      destinationX: 0,
      destinationY: 65.625,
      destinationWidth: 300,
      destinationHeight: 168.75,
    });
  });

  it('covers the canvas with a centered source crop', () => {
    expect(calculateCanvasDrawPlan(1920, 1080, 300, 300, 'cover', 1)).toEqual({
      sourceX: 420,
      sourceY: 0,
      sourceWidth: 1080,
      sourceHeight: 1080,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: 300,
      destinationHeight: 300,
    });
  });

  it('fills the complete bitmap without preserving aspect ratio', () => {
    expect(calculateCanvasDrawPlan(640, 480, 320, 180, 'fill', 1)).toEqual({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 640,
      sourceHeight: 480,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: 320,
      destinationHeight: 180,
    });
  });

  it('centers intrinsic CSS-pixel dimensions in none mode', () => {
    expect(calculateCanvasDrawPlan(100, 50, 600, 300, 'none', 2)).toEqual({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 100,
      sourceHeight: 50,
      destinationX: 200,
      destinationY: 100,
      destinationWidth: 200,
      destinationHeight: 100,
    });
  });

  it('defers drawing while any required dimension is unavailable', () => {
    expect(calculateCanvasDrawPlan(0, 1080, 300, 300, 'contain', 1)).toBeNull();
    expect(calculateCanvasDrawPlan(1920, 1080, 0, 300, 'contain', 1)).toBeNull();
  });
});
