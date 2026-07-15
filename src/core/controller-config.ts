import { createTimeline } from '../mapping/timeline.js';
import { FrameByFrameError } from './errors.js';

import type {
  AxisName,
  FrameByFrameAxisConfig,
  FrameByFrameOptions,
  MediaCrossOrigin,
  ReducedMotionBehavior,
  Timeline,
  TimelineOptions,
  VideoPreload,
  VideoLoadingTrigger,
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

export interface ControllerLoadingConfig {
  readonly mode: 'immediate' | 'on-demand';
  readonly trigger: VideoLoadingTrigger | null;
  readonly rootMargin: string | null;
  readonly credentials: RequestCredentials;
  readonly cache: RequestCache;
}

export interface ControllerBindingConfig {
  readonly id: string;
  readonly axis: AxisName;
  readonly timeline: Timeline;
  readonly startPosition: number;
  readonly endPosition: number;
  readonly target: unknown;
  readonly mountTo: unknown;
  readonly clips: readonly ControllerVideoClipConfig[];
  readonly loading: ControllerLoadingConfig;
  readonly video: ControllerVideoOptions;
  readonly timeEpsilon: number;
  readonly mediaSignature: string;
  readonly definition: Readonly<Record<string, unknown>>;
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

export interface ControllerBreakpointConfig {
  readonly id: string;
  readonly query: string;
  readonly override: Readonly<Record<string, unknown>>;
}

export interface ControllerProgram {
  readonly base: ControllerConfig;
  readonly breakpoints: readonly ControllerBreakpointConfig[];
  readonly reducedMotion: ReducedMotionBehavior;
}

const AXES = ['x', 'y'] as const;
const CROSS_ORIGIN_VALUES = ['', 'anonymous', 'use-credentials'] as const;
const PRELOAD_VALUES = ['none', 'metadata', 'auto', 'full'] as const;
const LOADING_MODES = ['immediate', 'on-demand'] as const;
const LOADING_TRIGGERS = ['manual', 'target-near-viewport', 'first-use'] as const;
const REQUEST_CREDENTIALS = ['omit', 'same-origin', 'include'] as const;
const REQUEST_CACHE = [
  'default',
  'no-store',
  'reload',
  'no-cache',
  'force-cache',
  'only-if-cached',
] as const;
const REDUCED_MOTION_BEHAVIORS = ['first-frame', 'last-frame', 'disable', 'ignore'] as const;
const BREAKPOINT_KEYS = ['id', 'query', 'override'] as const;
const BREAKPOINT_OVERRIDE_KEYS = ['axes'] as const;
const AXIS_OVERRIDE_KEYS = ['enabled', 'bindings'] as const;
const BINDING_OVERRIDE_KEYS = [
  'id',
  'segments',
  'clips',
  'easing',
  'frame',
  'loading',
  'video',
  'seek',
] as const;

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

const invalidBreakpoint = (
  message: string,
  details: Readonly<Record<string, unknown>>,
  cause?: unknown,
): never => {
  throw new FrameByFrameError('INVALID_BREAKPOINT_CONFIG', message, { cause, details });
};

const cloneTuple = (value: unknown): unknown =>
  Array.isArray(value) ? Object.freeze([...(value as unknown[])]) : value;

const cloneSegments = (value: unknown): unknown => {
  if (!Array.isArray(value)) {
    return value;
  }

  return Object.freeze(
    (value as unknown[]).map((segment: unknown): unknown =>
      isRecord(segment)
        ? Object.freeze({
            ...segment,
            scroll: cloneTuple(segment['scroll']),
            media: cloneTuple(segment['media']),
          })
        : segment,
    ),
  );
};

const cloneClips = (value: unknown): unknown => {
  if (!Array.isArray(value)) {
    return value;
  }

  return Object.freeze(
    (value as unknown[]).map((clip: unknown): unknown =>
      isRecord(clip)
        ? Object.freeze({
            ...clip,
            sources: Array.isArray(clip['sources'])
              ? Object.freeze(
                  (clip['sources'] as unknown[]).map((source: unknown): unknown =>
                    isRecord(source) ? Object.freeze({ ...source }) : source,
                  ),
                )
              : clip['sources'],
          })
        : clip,
    ),
  );
};

const cloneOption = (value: unknown): unknown =>
  isRecord(value) ? Object.freeze({ ...value }) : value;

const createBindingDefinition = (
  value: Readonly<Record<string, unknown>>,
  axis: AxisName,
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    id: value['id'],
    axis,
    ...(value['renderer'] === undefined ? {} : { renderer: value['renderer'] }),
    ...(value['target'] === undefined ? {} : { target: value['target'] }),
    ...(value['mountTo'] === undefined ? {} : { mountTo: value['mountTo'] }),
    segments: cloneSegments(value['segments']),
    clips: cloneClips(value['clips']),
    ...(value['easing'] === undefined ? {} : { easing: value['easing'] }),
    ...(value['frame'] === undefined ? {} : { frame: cloneOption(value['frame']) }),
    ...(value['loading'] === undefined ? {} : { loading: cloneOption(value['loading']) }),
    ...(value['video'] === undefined ? {} : { video: cloneOption(value['video']) }),
    ...(value['seek'] === undefined ? {} : { seek: cloneOption(value['seek']) }),
  });

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

const compileLoading = (
  value: unknown,
  bindingId: string,
  clips: readonly ControllerVideoClipConfig[],
): ControllerLoadingConfig => {
  if (value !== undefined && !isRecord(value)) {
    return invalidMediaConfig(bindingId, 'Loading options must be an object.', { loading: value });
  }

  const options = value ?? {};
  const mode = options['mode'] ?? 'immediate';
  const trigger = options['trigger'];
  const rootMargin = options['rootMargin'];
  const credentials = options['credentials'] ?? 'same-origin';
  const cache = options['cache'] ?? 'default';

  if (!LOADING_MODES.includes(mode as (typeof LOADING_MODES)[number])) {
    return invalidMediaConfig(bindingId, 'Loading mode is invalid.', { mode });
  }

  if (mode === 'on-demand') {
    if (!LOADING_TRIGGERS.includes(trigger as VideoLoadingTrigger)) {
      return invalidMediaConfig(bindingId, 'On-demand loading requires an explicit trigger.', {
        trigger,
      });
    }
  } else if (trigger !== undefined) {
    return invalidMediaConfig(bindingId, 'Immediate loading cannot declare a trigger.', {
      trigger,
    });
  }

  if (rootMargin !== undefined) {
    if (
      mode !== 'on-demand' ||
      trigger !== 'target-near-viewport' ||
      typeof rootMargin !== 'string' ||
      rootMargin.trim().length === 0
    ) {
      return invalidMediaConfig(
        bindingId,
        'rootMargin is only valid for target-near-viewport loading.',
        { rootMargin, trigger },
      );
    }
  }

  if (!REQUEST_CREDENTIALS.includes(credentials as RequestCredentials)) {
    return invalidMediaConfig(bindingId, 'Full preload credentials are invalid.', { credentials });
  }

  if (!REQUEST_CACHE.includes(cache as RequestCache)) {
    return invalidMediaConfig(bindingId, 'Full preload cache mode is invalid.', { cache });
  }

  const hasFullPreload = clips.some((clip) => clip.preload === 'full');

  if (!hasFullPreload && (options['credentials'] !== undefined || options['cache'] !== undefined)) {
    return invalidMediaConfig(
      bindingId,
      'Fetch credentials and cache options require at least one full-preload clip.',
      { cache: options['cache'], credentials: options['credentials'] },
    );
  }

  return Object.freeze({
    mode: mode as 'immediate' | 'on-demand',
    trigger: mode === 'on-demand' ? (trigger as VideoLoadingTrigger) : null,
    rootMargin:
      mode === 'on-demand' && trigger === 'target-near-viewport' ? (rootMargin ?? '0px') : null,
    credentials: credentials as RequestCredentials,
    cache: cache as RequestCache,
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
  const loading = compileLoading(value['loading'], id, clips);
  const video = compileVideoOptions(value['video'], id);
  const timeEpsilon = compileTimeEpsilon(value['seek'], id);
  const segments = value['segments'] as TimelineOptions['segments'];
  const startPosition = Math.min(...segments.map((segment) => segment.scroll[0]));
  const endPosition = Math.max(...segments.map((segment) => segment.scroll[1]));
  const definition = createBindingDefinition(value, axis);

  return Object.freeze({
    id,
    axis,
    timeline,
    startPosition,
    endPosition,
    target: hasTarget ? value['target'] : undefined,
    mountTo: hasMountTo ? value['mountTo'] : undefined,
    clips,
    loading,
    video,
    timeEpsilon,
    mediaSignature: JSON.stringify({ clips, loading, video, timeEpsilon }),
    definition,
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

const hasOwn = (value: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const assertKnownKeys = (
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  breakpointId: string,
  scope: string,
): void => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      invalidBreakpoint(`Breakpoint "${breakpointId}" cannot override "${scope}.${key}".`, {
        breakpointId,
        key,
        scope,
      });
    }
  }
};

const cloneBindingOverride = (
  value: unknown,
  breakpointId: string,
  axis: AxisName,
  bindingIds: ReadonlySet<string>,
): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) {
    return invalidBreakpoint('Each breakpoint binding override must be an object.', {
      axis,
      breakpointId,
      value,
    });
  }

  assertKnownKeys(value, BINDING_OVERRIDE_KEYS, breakpointId, `axes.${axis}.bindings`);
  const id = value['id'];

  if (typeof id !== 'string' || !bindingIds.has(id)) {
    return invalidBreakpoint(
      `Breakpoint "${breakpointId}" references an unknown binding on axis "${axis}".`,
      { axis, bindingId: id, breakpointId },
    );
  }

  for (const field of ['segments', 'clips'] as const) {
    if (hasOwn(value, field) && !Array.isArray(value[field])) {
      invalidBreakpoint(`Breakpoint binding override "${field}" must be an array.`, {
        axis,
        bindingId: id,
        breakpointId,
        field,
      });
    }
  }

  for (const field of ['frame', 'loading', 'video', 'seek'] as const) {
    if (hasOwn(value, field) && !isRecord(value[field])) {
      invalidBreakpoint(`Breakpoint binding override "${field}" must be an object.`, {
        axis,
        bindingId: id,
        breakpointId,
        field,
      });
    }
  }

  return Object.freeze({
    id,
    ...(hasOwn(value, 'segments') ? { segments: cloneSegments(value['segments']) } : {}),
    ...(hasOwn(value, 'clips') ? { clips: cloneClips(value['clips']) } : {}),
    ...(hasOwn(value, 'easing') ? { easing: value['easing'] } : {}),
    ...(hasOwn(value, 'frame') ? { frame: cloneOption(value['frame']) } : {}),
    ...(hasOwn(value, 'loading') ? { loading: cloneOption(value['loading']) } : {}),
    ...(hasOwn(value, 'video') ? { video: cloneOption(value['video']) } : {}),
    ...(hasOwn(value, 'seek') ? { seek: cloneOption(value['seek']) } : {}),
  });
};

const cloneBreakpointOverride = (
  value: unknown,
  breakpointId: string,
  base: ControllerConfig,
): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) {
    return invalidBreakpoint(`Breakpoint "${breakpointId}" override must be an object.`, {
      breakpointId,
      override: value,
    });
  }

  assertKnownKeys(value, BREAKPOINT_OVERRIDE_KEYS, breakpointId, 'override');
  const axesValue = value['axes'];

  if (!isRecord(axesValue) || Object.keys(axesValue).length === 0) {
    return invalidBreakpoint(`Breakpoint "${breakpointId}" requires at least one axis override.`, {
      axes: axesValue,
      breakpointId,
    });
  }

  assertKnownKeys(axesValue, AXES, breakpointId, 'axes');
  const axes: Partial<Record<AxisName, unknown>> = {};

  for (const axis of AXES) {
    if (!hasOwn(axesValue, axis)) {
      continue;
    }

    const axisValue = axesValue[axis];
    const baseAxis = base.axes[axis];

    if (baseAxis === undefined) {
      return invalidBreakpoint(`Breakpoint "${breakpointId}" references an unconfigured axis.`, {
        axis,
        breakpointId,
      });
    }

    if (axisValue === false) {
      axes[axis] = false;
      continue;
    }

    if (!isRecord(axisValue)) {
      return invalidBreakpoint(`Breakpoint axis "${axis}" must be an object or false.`, {
        axis,
        breakpointId,
        value: axisValue,
      });
    }

    assertKnownKeys(axisValue, AXIS_OVERRIDE_KEYS, breakpointId, `axes.${axis}`);

    if (hasOwn(axisValue, 'enabled') && typeof axisValue['enabled'] !== 'boolean') {
      return invalidBreakpoint(`Breakpoint axis "${axis}" enabled must be a boolean.`, {
        axis,
        breakpointId,
        enabled: axisValue['enabled'],
      });
    }

    const bindingIds = new Set(baseAxis.bindings.map((binding) => binding.id));
    const bindingsValue = axisValue['bindings'];

    if (hasOwn(axisValue, 'bindings') && !Array.isArray(bindingsValue)) {
      return invalidBreakpoint(`Breakpoint axis "${axis}" bindings must be an array.`, {
        axis,
        bindings: bindingsValue,
        breakpointId,
      });
    }

    const seen = new Set<string>();
    const bindings = Array.isArray(bindingsValue)
      ? bindingsValue.map((binding) => {
          const cloned = cloneBindingOverride(binding, breakpointId, axis, bindingIds);
          const bindingId = cloned['id'] as string;

          if (seen.has(bindingId)) {
            invalidBreakpoint(
              `Breakpoint "${breakpointId}" overrides binding "${bindingId}" more than once.`,
              { axis, bindingId, breakpointId },
            );
          }

          seen.add(bindingId);
          return cloned;
        })
      : undefined;

    axes[axis] = Object.freeze({
      ...(hasOwn(axisValue, 'enabled') ? { enabled: axisValue['enabled'] } : {}),
      ...(bindings === undefined ? {} : { bindings: Object.freeze(bindings) }),
    });
  }

  return Object.freeze({ axes: Object.freeze(axes) });
};

const compileBreakpoints = (
  value: unknown,
  base: ControllerConfig,
): readonly ControllerBreakpointConfig[] => {
  if (value === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    return invalidBreakpoint('Controller breakpoints must be an array.', { breakpoints: value });
  }

  const ids = new Set<string>();
  const breakpoints = value.map((candidate, index): ControllerBreakpointConfig => {
    if (!isRecord(candidate)) {
      return invalidBreakpoint('Each breakpoint must be an object.', {
        breakpoint: candidate,
        index,
      });
    }

    const provisionalId =
      typeof candidate['id'] === 'string' && candidate['id'].trim().length > 0
        ? candidate['id']
        : `#${String(index)}`;
    assertKnownKeys(candidate, BREAKPOINT_KEYS, provisionalId, 'breakpoint');

    const id = candidate['id'];
    const query = candidate['query'];

    if (typeof id !== 'string' || id.trim().length === 0) {
      return invalidBreakpoint('Each breakpoint requires a non-empty string ID.', { id, index });
    }

    if (ids.has(id)) {
      return invalidBreakpoint(`Breakpoint ID "${id}" is duplicated.`, { breakpointId: id });
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return invalidBreakpoint(`Breakpoint "${id}" requires a non-empty media query.`, {
        breakpointId: id,
        query,
      });
    }

    ids.add(id);
    return Object.freeze({
      id,
      query,
      override: cloneBreakpointOverride(candidate['override'], id, base),
    });
  });

  return Object.freeze(breakpoints);
};

const mergeOption = (current: unknown, override: unknown): unknown =>
  isRecord(current) && isRecord(override)
    ? Object.freeze({ ...current, ...override })
    : cloneOption(override);

const mergeBindingDefinition = (
  current: Readonly<Record<string, unknown>>,
  override: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const next: Record<string, unknown> = { ...current };

  for (const field of ['segments', 'clips', 'easing'] as const) {
    if (hasOwn(override, field)) {
      next[field] = override[field];
    }
  }

  for (const field of ['frame', 'loading', 'video', 'seek'] as const) {
    if (hasOwn(override, field)) {
      next[field] = mergeOption(current[field], override[field]);
    }
  }

  const frame = next['frame'];

  if (isRecord(frame) && frame['snap'] === false) {
    const withoutFps = { ...frame };
    delete withoutFps['fps'];
    next['frame'] = Object.freeze(withoutFps);
  }

  const loading = next['loading'];

  if (isRecord(loading)) {
    const normalized = { ...loading };

    if (normalized['mode'] === 'immediate') {
      delete normalized['trigger'];
      delete normalized['rootMargin'];
    } else if (normalized['trigger'] !== 'target-near-viewport') {
      delete normalized['rootMargin'];
    }

    next['loading'] = Object.freeze(normalized);
  }

  return Object.freeze(next);
};

/** Resolves and revalidates one ordered set of matching breakpoint IDs. */
export const resolveControllerConfig = (
  program: ControllerProgram,
  activeBreakpointIds: readonly string[],
): ControllerConfig => {
  const active = new Set(activeBreakpointIds);
  const axes = new Map<
    AxisName,
    { enabled: boolean; bindings: Map<string, Readonly<Record<string, unknown>>> }
  >();

  for (const axis of AXES) {
    const baseAxis = program.base.axes[axis];

    if (baseAxis !== undefined) {
      axes.set(axis, {
        enabled: baseAxis.enabled,
        bindings: new Map(
          baseAxis.bindings.map((binding) => [binding.id, binding.definition] as const),
        ),
      });
    }
  }

  for (const breakpoint of program.breakpoints) {
    if (!active.has(breakpoint.id)) {
      continue;
    }

    const breakpointAxes = breakpoint.override['axes'] as Readonly<Record<string, unknown>>;

    for (const axis of AXES) {
      if (!hasOwn(breakpointAxes, axis)) {
        continue;
      }

      const target = axes.get(axis);
      const override = breakpointAxes[axis];

      if (target === undefined) {
        continue;
      }

      if (override === false) {
        target.enabled = false;
        continue;
      }

      if (!isRecord(override)) {
        continue;
      }

      if (hasOwn(override, 'enabled')) {
        target.enabled = override['enabled'] as boolean;
      }

      const bindingOverrides = override['bindings'];

      if (Array.isArray(bindingOverrides)) {
        for (const bindingOverride of bindingOverrides as Readonly<Record<string, unknown>>[]) {
          const bindingId = bindingOverride['id'] as string;
          const current = target.bindings.get(bindingId);

          if (current !== undefined) {
            target.bindings.set(bindingId, mergeBindingDefinition(current, bindingOverride));
          }
        }
      }
    }
  }

  const resolvedAxes: Record<string, unknown> = {};

  for (const [axis, value] of axes) {
    resolvedAxes[axis] = {
      enabled: value.enabled,
      bindings: [...value.bindings.values()],
    };
  }

  try {
    return compileControllerConfig({
      ...(program.base.source === undefined
        ? {}
        : { source: program.base.source as NonNullable<FrameByFrameOptions['source']> }),
      axes: resolvedAxes,
    });
  } catch (cause) {
    return invalidBreakpoint(
      'The matching breakpoint cascade does not produce a valid controller configuration.',
      { activeBreakpoints: Object.freeze([...activeBreakpointIds]) },
      cause,
    );
  }
};

/** Compiles the immutable base configuration and responsive program at factory time. */
export const compileControllerProgram = (options: FrameByFrameOptions): ControllerProgram => {
  const base = compileControllerConfig(options);
  const reducedMotion = options.reducedMotion ?? 'first-frame';

  if (!REDUCED_MOTION_BEHAVIORS.includes(reducedMotion)) {
    return invalidController('Controller reducedMotion behavior is invalid.', { reducedMotion });
  }

  return Object.freeze({
    base,
    breakpoints: compileBreakpoints(options.breakpoints, base),
    reducedMotion,
  });
};
