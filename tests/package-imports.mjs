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
assert.equal(video.createTimeline, core.createTimeline);
assert.equal(video.createFrameByFrame, core.createFrameByFrame);
assert.equal(video.FrameByFrameError, core.FrameByFrameError);
assert.equal(typeof canvas.createFrameByFrame, 'function');
assert.equal(typeof canvas.createTimeline, 'function');
assert.equal(typeof canvas.FrameByFrameError, 'function');

const controller = core.createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'intro',
          target: '#intro',
          clips: [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }],
          segments: [{ media: [0, 1], scroll: [0, 1] }],
        },
      ],
    },
  },
});
assert.equal(controller.getState().status, 'idle');

const explicitVideoController = video.createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'explicit-video',
          target: '#explicit-video',
          clips: [{ id: 'clip', sources: [{ src: '/explicit.mp4' }] }],
          segments: [{ media: [0, 1], scroll: [0, 1] }],
        },
      ],
    },
  },
});
assert.equal(explicitVideoController.getState().bindings['explicit-video'].renderer, 'video');

const canvasController = canvas.createFrameByFrame({
  axes: {
    y: {
      bindings: [
        {
          id: 'canvas',
          renderer: 'canvas',
          target: '#canvas',
          clips: [{ id: 'clip', sources: [{ src: '/clip.mp4' }] }],
          segments: [{ media: [0, 1], scroll: [0, 1] }],
        },
      ],
    },
  },
});
assert.equal(canvasController.getState().bindings.canvas.renderer, 'canvas');

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
assert.deepEqual(Object.keys(types), []);
