import { createController } from './core/controller.js';
import { FrameByFrameError } from './core/errors.js';
import {
  createVideoRenderer,
  reportAsyncError,
  sourceRegistry,
  videoTargetRegistry,
} from './core/public-controller.js';
import { createTimeline } from './mapping/timeline.js';
import {
  CanvasTargetRegistry,
  resolveCanvasDecoder,
  resolveCanvasTarget,
} from './media/canvas-target.js';
import { createCanvasRenderer } from './media/canvas-renderer.js';
import { resolveScrollSource } from './scroll/source.js';

import type { CanvasFrameByFrameController, CanvasFrameByFrameOptions } from './types.js';
import type { MediaRendererFactory } from './media/video-renderer.js';

const canvasTargetRegistry = new CanvasTargetRegistry();

const createRenderer: MediaRendererFactory = (config, onEvent, activity) => {
  if (config.renderer === 'video') {
    return createVideoRenderer(config, onEvent, activity);
  }

  const canvasHandle = resolveCanvasTarget(config, canvasTargetRegistry);
  let decoderHandle: ReturnType<typeof resolveCanvasDecoder> | null = null;

  try {
    decoderHandle = resolveCanvasDecoder(config, canvasHandle.target, videoTargetRegistry);
    return createCanvasRenderer(config, canvasHandle, decoderHandle, onEvent, activity);
  } catch (error) {
    decoderHandle?.release();
    canvasHandle.release();
    throw error;
  }
};

/** Creates an SSR-safe controller with opt-in native-video and 2D-canvas renderers. */
export const createFrameByFrame = (
  options: CanvasFrameByFrameOptions,
): CanvasFrameByFrameController =>
  createController(options, {
    resolveSource: resolveScrollSource,
    sourceRegistry,
    reportAsyncError,
    createRenderer,
    supportedRenderers: new Set(['video', 'canvas']),
  });

export { FrameByFrameError, createTimeline };
export type * from './types.js';
