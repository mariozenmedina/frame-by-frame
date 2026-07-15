import { createController } from './controller.js';
import { resolveScrollSource } from '../scroll/source.js';
import { SourceRegistry } from '../scroll/source-scheduler.js';

import type { FrameByFrameController, FrameByFrameOptions } from '../types.js';

const reportAsyncError = (error: unknown): void => {
  globalThis.queueMicrotask((): void => {
    throw error;
  });
};

const sourceRegistry = new SourceRegistry(reportAsyncError);

/** Creates an SSR-safe controller; browser capabilities are resolved by mount(). */
export const createFrameByFrame = (options: FrameByFrameOptions): FrameByFrameController =>
  createController(options, {
    resolveSource: resolveScrollSource,
    sourceRegistry,
    reportAsyncError,
  });
