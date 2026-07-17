import { createController } from './controller.js';
import { createNativeVideoRenderer } from '../media/video-renderer.js';
import { resolveVideoTarget, VideoTargetRegistry } from '../media/video-target.js';
import { resolveScrollSource } from '../scroll/source.js';
import { SourceRegistry } from '../scroll/source-scheduler.js';

import type { VideoRendererFactory } from '../media/video-renderer.js';
import type { FrameByFrameController, FrameByFrameOptions } from '../types.js';

export const reportAsyncError = (error: unknown): void => {
  globalThis.queueMicrotask((): void => {
    throw error;
  });
};

export const sourceRegistry: SourceRegistry = new SourceRegistry(reportAsyncError);
export const videoTargetRegistry: VideoTargetRegistry = new VideoTargetRegistry();
export const createVideoRenderer: VideoRendererFactory = (config, onEvent, activity) => {
  const handle = resolveVideoTarget(config, videoTargetRegistry);

  try {
    return createNativeVideoRenderer(config, handle, onEvent, undefined, activity);
  } catch (error) {
    handle.release();
    throw error;
  }
};

/** Creates an SSR-safe controller; browser capabilities are resolved by mount(). */
export const createFrameByFrame = (options: FrameByFrameOptions): FrameByFrameController =>
  createController(options, {
    resolveSource: resolveScrollSource,
    sourceRegistry,
    reportAsyncError,
    createRenderer: createVideoRenderer,
    supportedRenderers: new Set(['video']),
  }) as FrameByFrameController;
