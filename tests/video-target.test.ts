import { describe, expect, it } from 'vitest';

import { compileControllerConfig } from '../src/core/controller-config.js';
import { resolveVideoTarget, VideoTargetRegistry } from '../src/media/video-target.js';
import {
  FakeMediaContainer,
  FakeMediaDocument,
  FakeVideoElement,
  installDocument,
} from './helpers/fake-video.js';

const compileBinding = (targetConfig: object) => {
  const binding = compileControllerConfig({
    axes: {
      y: {
        bindings: [
          {
            id: 'story',
            clips: [{ id: 'intro', sources: [{ src: '/intro.mp4' }] }],
            segments: [{ clip: 'intro', media: [0, 1], scroll: [0, 1] }],
            ...targetConfig,
          },
        ],
      },
    },
  } as never).bindings[0];

  if (binding === undefined) {
    throw new Error('Expected a compiled video binding.');
  }

  return binding;
};

describe('native video target resolution', () => {
  it('resolves direct targets and prevents conflicts until release', () => {
    const registry = new VideoTargetRegistry();
    const target = new FakeVideoElement();
    const config = compileBinding({ target: target.asVideo() });
    const first = resolveVideoTarget(config, registry);

    expect(first).toMatchObject({ target, owned: false });
    expect(() => resolveVideoTarget(config, registry)).toThrow(
      expect.objectContaining({ code: 'TARGET_CONFLICT' }),
    );

    first.release();
    first.release();
    expect(() => {
      resolveVideoTarget(config, registry).release();
    }).not.toThrow();
  });

  it('creates and removes an owned video inside mountTo', () => {
    const document = new FakeMediaDocument();
    const container = new FakeMediaContainer(document);
    const handle = resolveVideoTarget(
      compileBinding({ mountTo: container.asElement() }),
      new VideoTargetRegistry(),
    );

    expect(handle.owned).toBe(true);
    expect(container.children).toEqual([handle.target]);
    handle.release();
    expect(container.children).toEqual([]);
  });

  it('supports selectors and lazy resolvers at mount time', () => {
    const document = new FakeMediaDocument();
    const target = new FakeVideoElement();
    document.selections.set('#video', target);
    const restore = installDocument(document);

    try {
      const selected = resolveVideoTarget(
        compileBinding({ target: '#video' }),
        new VideoTargetRegistry(),
      );
      expect(selected.target).toBe(target);
      selected.release();

      const resolved = resolveVideoTarget(
        compileBinding({ target: () => target.asVideo() }),
        new VideoTargetRegistry(),
      );
      expect(resolved.target).toBe(target);
      resolved.release();
    } finally {
      restore();
    }
  });

  it('reports missing, invalid, and failing references with stable codes', () => {
    const document = new FakeMediaDocument();
    const restore = installDocument(document);

    try {
      expect(() =>
        resolveVideoTarget(compileBinding({ target: '#missing' }), new VideoTargetRegistry()),
      ).toThrow(expect.objectContaining({ code: 'TARGET_NOT_FOUND' }));
      document.selectorError = new Error('bad selector');
      expect(() =>
        resolveVideoTarget(compileBinding({ target: '[' }), new VideoTargetRegistry()),
      ).toThrow(expect.objectContaining({ code: 'TARGET_NOT_FOUND' }));
      expect(() =>
        resolveVideoTarget(
          compileBinding({
            target: () => {
              throw new Error('resolver failed');
            },
          }),
          new VideoTargetRegistry(),
        ),
      ).toThrow(expect.objectContaining({ code: 'TARGET_NOT_FOUND' }));
      expect(() =>
        resolveVideoTarget(compileBinding({ target: { nodeType: 1 } }), new VideoTargetRegistry()),
      ).toThrow(expect.objectContaining({ code: 'INVALID_TARGET_TYPE' }));
    } finally {
      restore();
    }
  });

  it('keeps selector resolution SSR-safe', () => {
    expect(() =>
      resolveVideoTarget(compileBinding({ target: '#video' }), new VideoTargetRegistry()),
    ).toThrow(expect.objectContaining({ code: 'ENVIRONMENT_UNAVAILABLE' }));
  });
});
