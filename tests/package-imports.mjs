import assert from 'node:assert/strict';

const [core, video, canvas, types] = await Promise.all([
  import('@frame-by-frame/core'),
  import('@frame-by-frame/core/video'),
  import('@frame-by-frame/core/canvas'),
  import('@frame-by-frame/core/types'),
]);

assert.equal(typeof core.createTimeline, 'function');
assert.equal(typeof core.createFrameByFrame, 'function');
assert.equal(typeof core.FrameByFrameError, 'function');

const controller = core.createFrameByFrame({
  axes: {
    y: {
      bindings: [{ id: 'intro', segments: [{ media: [0, 1], scroll: [0, 1] }] }],
    },
  },
});
assert.equal(controller.getState().status, 'idle');

const timeline = core.createTimeline({
  segments: [
    { clip: 'first', media: [0, 5], scroll: [0, 10] },
    { clip: 'second', media: [20, 30], scroll: [10, 20] },
  ],
});

assert.deepEqual(timeline.resolve(10), {
  phase: 'active',
  segmentIndex: 1,
  clipId: 'second',
  rawProgress: 0,
  easedProgress: 0,
  requestedTime: 20,
  targetTime: 20,
});
assert.deepEqual(Object.keys(video), []);
assert.deepEqual(Object.keys(canvas), []);
assert.deepEqual(Object.keys(types), []);
