import { createTimeline } from '../mapping/timeline.js';
import { FrameByFrameError } from './errors.js';

import type {
  AxisName,
  FrameByFrameAxisConfig,
  FrameByFrameOptions,
  Timeline,
  TimelineOptions,
} from '../types.js';

export interface ControllerBindingConfig {
  readonly id: string;
  readonly axis: AxisName;
  readonly timeline: Timeline;
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const invalidController = (message: string, details: Readonly<Record<string, unknown>>): never => {
  throw new FrameByFrameError('INVALID_CONTROLLER', message, { details });
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

  const timelineOptions: TimelineOptions = {
    segments: value['segments'] as TimelineOptions['segments'],
    ...(value['easing'] === undefined
      ? {}
      : { easing: value['easing'] as NonNullable<TimelineOptions['easing']> }),
    ...(value['frame'] === undefined
      ? {}
      : { frame: value['frame'] as NonNullable<TimelineOptions['frame']> }),
  };

  return Object.freeze({
    id,
    axis,
    timeline: createTimeline(timelineOptions),
  });
};

/** Validates controller shape and compiles every pure timeline at factory time. */
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
