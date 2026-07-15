import { createTimeline } from '../mapping/timeline.js';
import { FrameByFrameError } from './errors.js';

import type {
  AxisName,
  FrameByFrameAxisConfig,
  FrameByFrameOptions,
  MediaCrossOrigin,
  Timeline,
  TimelineOptions,
  VideoPreload,
} from '../types.js';

export interface ControllerVideoSourceConfig {
  readonly src: string;
  readonly type: string | null;
}

export interface ControllerVideoClipConfig {
  readonly id: string;
  readonly sources: readonly ControllerVideoSourceConfig[];
  readonly poster: string | null;
  readonly crossOrigin: MediaCrossOrigin | null;
  readonly preload: VideoPreload;
}

export interface ControllerVideoOptions {
  readonly muted: boolean | undefined;
  readonly playsInline: boolean | undefined;
  readonly controls: boolean | undefined;
  readonly loop: boolean | undefined;
}

export interface ControllerBindingConfig {
  readonly id: string;
  readonly axis: AxisName;
  readonly timeline: Timeline;
  readonly target: unknown;
  readonly mountTo: unknown;
  readonly clips: readonly ControllerVideoClipConfig[];
  readonly video: ControllerVideoOptions;
  readonly timeEpsilon: number;
}

export interface ControllerAxisConfig {
  readonly enabled: boolean;
  readonly bindings: readonly ControllerBindingConfig[];
}

export interface ControllerConfig {
  readonly source: unknown;
  readonly axes: Readonly<Partial<Record<AxisName, ControllerAxisConfig>>>;
  readonly bindings: readonly ControllerBindingConfig[];
}

const AXES = ['x', 'y'] as const;
const CROSS_ORIGIN_VALUES = ['', 'anonymous', 'use-credentials'] as const;
const PRELOAD_VALUES = ['none', 'metadata', 'auto'] as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const invalidController = (message: string, details: Readonly<Record<string, unknown>>): never => {
  throw new FrameByFrameError('INVALID_CONTROLLER', message, { details });
};

const invalidMediaConfig = (
  bindingId: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
): never => {
  throw new FrameByFrameError('INVALID_MEDIA_CONFIG', message, {
    details: { ...details, bindingId },
  });
};

const readAxis = (value: unknown, axis: AxisName): FrameByFrameAxisConfig => {
  if (!isRecord(value)) {
    return invalidController(`Axis "${axis}" must be an object or false.`, { axis, value });
  }

  if (value['enabled'] !== undefined && typeof value['enabled'] !== 'boolean') {
    return invalidController(`Axis "${axis}" enabled must be a boolean.`, {
      axis,
      enabled: value['enabled'],
    });
  }

  if (!Array.isArray(value['bindings']) || value['bindings'].length === 0) {
    return invalidController(`Axis "${axis}" requires at least one binding.`, {
      axis,
      bindings: value['bindings'],
    });
  }

  return value as unknown as FrameByFrameAxisConfig;
};

const isElementReference = (value: unknown): boolean =>
  typeof value === 'function' ||
  (typeof value === 'string' && value.trim().length > 0) ||
  isRecord(value);

const compileSource = (
  value: unknown,
  bindingId: string,
  clipId: string,
  sourceIndex: number,
): ControllerVideoSourceConfig => {
  if (!isRecord(value)) {
    return invalidMediaConfig(bindingId, 'Each video source must be an object.', {
      clipId,
      source: value,
      sourceIndex,
    });
  }

  const src = value['src'];
  const type = value['type'];

  if (typeof src !== 'string' || src.trim().length === 0) {
    return invalidMediaConfig(bindingId, 'Video source src must be a non-empty string.', {
      clipId,
      sourceIndex,
      src,
    });
  }

  if (type !== undefined && (typeof type !== 'string' || type.trim().length === 0)) {
    return invalidMediaConfig(bindingId, 'Video source type must be a non-empty string.', {
      clipId,
      sourceIndex,
      type,
    });
  }

  return Object.freeze({ src, type: type ?? null });
};

const compileClip = (
  value: unknown,
  bindingId: string,
  clipIndex: number,
): ControllerVideoClipConfig => {
  if (!isRecord(value)) {
    return invalidMediaConfig(bindingId, 'Each video clip must be an object.', {
      clip: value,
      clipIndex,
    });
  }

  const id = value['id'];
  const sources = value['sources'];
  const poster = value['poster'];
  const crossOrigin = value['crossOrigin'];
  const preload = value['preload'];

  if (typeof id !== 'string' || id.trim().length === 0) {
    return invalidMediaConfig(bindingId, 'Each video clip requires a non-empty string ID.', {
      clipId: id,
      clipIndex,
    });
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    return invalidMediaConfig(bindingId, `Video clip "${id}" requires at least one source.`, {
      clipId: id,
      sources,
    });
  }

  if (poster !== undefined && (typeof poster !== 'string' || poster.trim().length === 0)) {
    return invalidMediaConfig(bindingId, 'Video clip poster must be a non-empty string.', {
      clipId: id,
      poster,
    });
  }

  if (crossOrigin !== undefined && !CROSS_ORIGIN_VALUES.includes(crossOrigin as MediaCrossOrigin)) {
    return invalidMediaConfig(bindingId, 'Video clip crossOrigin is invalid.', {
      clipId: id,
      crossOrigin,
    });
  }

  if (preload !== undefined && !PRELOAD_VALUES.includes(preload as VideoPreload)) {
    return invalidMediaConfig(bindingId, 'Video clip preload is invalid.', {
      clipId: id,
      preload,
    });
  }

  return Object.freeze({
    id,
    sources: Object.freeze(
      sources.map((source, sourceIndex) => compileSource(source, bindingId, id, sourceIndex)),
    ),
    poster: poster ?? null,
    crossOrigin: (crossOrigin as MediaCrossOrigin | undefined) ?? null,
    preload: (preload as VideoPreload | undefined) ?? 'metadata',
  });
};

const compileClips = (value: unknown, bindingId: string): readonly ControllerVideoClipConfig[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return invalidMediaConfig(bindingId, 'Each binding requires at least one video clip.', {
      clips: value,
    });
  }

  const ids = new Set<string>();
  const clips = value.map((clip, clipIndex) => compileClip(clip, bindingId, clipIndex));

  for (const clip of clips) {
    if (ids.has(clip.id)) {
      return invalidMediaConfig(bindingId, `Video clip ID "${clip.id}" is duplicated.`, {
        clipId: clip.id,
      });
    }

    ids.add(clip.id);
  }

  return Object.freeze(clips);
};

const compileVideoOptions = (value: unknown, bindingId: string): ControllerVideoOptions => {
  if (value !== undefined && !isRecord(value)) {
    return invalidMediaConfig(bindingId, 'Video options must be an object.', { video: value });
  }

  const options = value ?? {};
  const fields = ['muted', 'playsInline', 'controls', 'loop'] as const;

  for (const field of fields) {
    if (options[field] !== undefined && typeof options[field] !== 'boolean') {
      return invalidMediaConfig(bindingId, `Video option "${field}" must be a boolean.`, {
        field,
        value: options[field],
      });
    }
  }

  return Object.freeze({
    muted: options['muted'] as boolean | undefined,
    playsInline: options['playsInline'] as boolean | undefined,
    controls: options['controls'] as boolean | undefined,
    loop: options['loop'] as boolean | undefined,
  });
};

const compileTimeEpsilon = (value: unknown, bindingId: string): number => {
  if (value === undefined) {
    return 0.001;
  }

  if (!isRecord(value)) {
    return invalidMediaConfig(bindingId, 'Seek options must be an object.', { seek: value });
  }

  const epsilon = value['timeEpsilon'];

  if (
    epsilon !== undefined &&
    (typeof epsilon !== 'number' || !Number.isFinite(epsilon) || epsilon < 0)
  ) {
    return invalidMediaConfig(bindingId, 'Seek timeEpsilon must be finite and non-negative.', {
      timeEpsilon: epsilon,
    });
  }

  return epsilon ?? 0.001;
};

const validateSegmentClips = (
  segments: unknown,
  clips: readonly ControllerVideoClipConfig[],
  bindingId: string,
): void => {
  if (!Array.isArray(segments)) {
    return;
  }

  const clipIds = new Set(clips.map((clip) => clip.id));

  for (const [segmentIndex, segment] of segments.entries()) {
    if (!isRecord(segment)) {
      continue;
    }

    const clipId = segment['clip'];

    if (clips.length > 1 && clipId === undefined) {
      invalidMediaConfig(
        bindingId,
        'Every segment requires a clip when a binding has multiple clips.',
        {
          segmentIndex,
        },
      );
    }

    if (clipId !== undefined && (typeof clipId !== 'string' || !clipIds.has(clipId))) {
      invalidMediaConfig(bindingId, 'Timeline segment references an unknown video clip.', {
        clipId,
        segmentIndex,
      });
    }
  }
};

const compileBinding = (value: unknown, axis: AxisName): ControllerBindingConfig => {
  if (!isRecord(value)) {
    return invalidController('Each controller binding must be an object.', {
      axis,
      binding: value,
    });
  }

  const id = value['id'];

  if (typeof id !== 'string' || id.trim().length === 0) {
    return invalidController('Each controller binding requires a non-empty string ID.', {
      axis,
      id,
    });
  }

  if (value['renderer'] !== undefined && value['renderer'] !== 'video') {
    return invalidMediaConfig(id, 'Only the native video renderer is currently supported.', {
      renderer: value['renderer'],
    });
  }

  const hasTarget = value['target'] !== undefined;
  const hasMountTo = value['mountTo'] !== undefined;

  if (hasTarget === hasMountTo) {
    return invalidMediaConfig(id, 'A binding requires exactly one of target or mountTo.', {
      mountTo: value['mountTo'],
      target: value['target'],
    });
  }

  const reference = hasTarget ? value['target'] : value['mountTo'];

  if (!isElementReference(reference)) {
    return invalidMediaConfig(
      id,
      'Video target references must be elements, selectors, or resolvers.',
      {
        reference,
      },
    );
  }

  const timelineOptions: TimelineOptions = {
    segments: value['segments'] as TimelineOptions['segments'],
    ...(value['easing'] === undefined
      ? {}
      : { easing: value['easing'] as NonNullable<TimelineOptions['easing']> }),
    ...(value['frame'] === undefined
      ? {}
      : { frame: value['frame'] as NonNullable<TimelineOptions['frame']> }),
  };
  const timeline = createTimeline(timelineOptions);
  const clips = compileClips(value['clips'], id);
  validateSegmentClips(value['segments'], clips, id);

  return Object.freeze({
    id,
    axis,
    timeline,
    target: hasTarget ? value['target'] : undefined,
    mountTo: hasMountTo ? value['mountTo'] : undefined,
    clips,
    video: compileVideoOptions(value['video'], id),
    timeEpsilon: compileTimeEpsilon(value['seek'], id),
  });
};

/** Validates controller shape and compiles every timeline and media binding at factory time. */
export const compileControllerConfig = (options: FrameByFrameOptions): ControllerConfig => {
  if (!isRecord(options)) {
    return invalidController('Controller options must be an object.', { options });
  }

  const axesValue: unknown = options.axes;

  if (!isRecord(axesValue)) {
    return invalidController('Controller axes must be an object.', { axes: axesValue });
  }

  const axes: Partial<Record<AxisName, ControllerAxisConfig>> = {};
  const bindings: ControllerBindingConfig[] = [];
  const ids = new Set<string>();

  for (const axisName of AXES) {
    const axisValue = axesValue[axisName];

    if (axisValue === undefined || axisValue === false) {
      continue;
    }

    const axis = readAxis(axisValue, axisName);
    const axisBindings = axis.bindings.map((binding) => compileBinding(binding, axisName));

    for (const binding of axisBindings) {
      if (ids.has(binding.id)) {
        throw new FrameByFrameError(
          'DUPLICATE_BINDING_ID',
          `Binding ID "${binding.id}" is used more than once.`,
          { details: { bindingId: binding.id } },
        );
      }

      ids.add(binding.id);
      bindings.push(binding);
    }

    axes[axisName] = Object.freeze({
      enabled: axis.enabled ?? true,
      bindings: Object.freeze(axisBindings),
    });
  }

  if (bindings.length === 0) {
    return invalidController('At least one configured axis with one binding is required.', {
      axes: axesValue,
    });
  }

  return Object.freeze({
    source: options.source,
    axes: Object.freeze(axes),
    bindings: Object.freeze(bindings),
  });
};
