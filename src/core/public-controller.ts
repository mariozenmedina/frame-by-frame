import { createController } from './controller.js';
import { createNativeVideoRenderer } from '../media/video-renderer.js';
import { resolveVideoTarget, VideoTargetRegistry } from '../media/video-target.js';
import { resolveScrollSource } from '../scroll/source.js';
import { SourceRegistry } from '../scroll/source-scheduler.js';

import type { VideoRendererFactory } from '../media/video-renderer.js';
import type { FrameByFrameController, FrameByFrameOptions } from '../types.js';

const reportAsyncError = (error: unknown): void => {
  globalThis.queueMicrotask((): void => {
    throw error;
  });
};

const sourceRegistry = new SourceRegistry(reportAsyncError);
const videoTargetRegistry = new VideoTargetRegistry();
const createVideoRenderer: VideoRendererFactory = (config, onEvent) => {
  const handle = resolveVideoTarget(config, videoTargetRegistry);

  try {
    return createNativeVideoRenderer(config, handle, onEvent);
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
    createVideoRenderer,
  });
