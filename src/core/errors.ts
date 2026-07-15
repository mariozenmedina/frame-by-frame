import type {
  FrameByFrameErrorCode,
  FrameByFrameErrorDetails,
  FrameByFrameErrorOptions,
} from '../types.js';

/** An error with a stable package-specific code and structured context. */
export class FrameByFrameError extends Error {
  override readonly name = 'FrameByFrameError' as const;
  override readonly cause: unknown;
  readonly code: FrameByFrameErrorCode;
  readonly details: FrameByFrameErrorDetails | undefined;

  constructor(
    code: FrameByFrameErrorCode,
    message: string,
    options: FrameByFrameErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.cause = options.cause;
    this.code = code;
    this.details =
      options.details === undefined ? undefined : Object.freeze({ ...options.details });
  }
}
