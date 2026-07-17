import type { CanvasFit } from '../types.js';

/** Source and destination rectangles passed to CanvasRenderingContext2D.drawImage(). */
export interface CanvasDrawPlan {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly destinationWidth: number;
  readonly destinationHeight: number;
}

const centered = (outer: number, inner: number): number => (outer - inner) / 2;

/** Computes centered object-fit-like rectangles without reading layout or touching a canvas. */
export const calculateCanvasDrawPlan = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: CanvasFit,
  pixelRatio: number,
): CanvasDrawPlan | null => {
  if (
    ![sourceWidth, sourceHeight, targetWidth, targetHeight, pixelRatio].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return null;
  }

  if (fit === 'fill') {
    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: targetWidth,
      destinationHeight: targetHeight,
    };
  }

  if (fit === 'none') {
    const destinationWidth = sourceWidth * pixelRatio;
    const destinationHeight = sourceHeight * pixelRatio;

    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
      destinationX: centered(targetWidth, destinationWidth),
      destinationY: centered(targetHeight, destinationHeight),
      destinationWidth,
      destinationHeight,
    };
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (fit === 'cover') {
    if (sourceRatio > targetRatio) {
      const croppedWidth = sourceHeight * targetRatio;

      return {
        sourceX: centered(sourceWidth, croppedWidth),
        sourceY: 0,
        sourceWidth: croppedWidth,
        sourceHeight,
        destinationX: 0,
        destinationY: 0,
        destinationWidth: targetWidth,
        destinationHeight: targetHeight,
      };
    }

    const croppedHeight = sourceWidth / targetRatio;

    return {
      sourceX: 0,
      sourceY: centered(sourceHeight, croppedHeight),
      sourceWidth,
      sourceHeight: croppedHeight,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: targetWidth,
      destinationHeight: targetHeight,
    };
  }

  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const destinationWidth = sourceWidth * scale;
  const destinationHeight = sourceHeight * scale;

  return {
    sourceX: 0,
    sourceY: 0,
    sourceWidth,
    sourceHeight,
    destinationX: centered(targetWidth, destinationWidth),
    destinationY: centered(targetHeight, destinationHeight),
    destinationWidth,
    destinationHeight,
  };
};
