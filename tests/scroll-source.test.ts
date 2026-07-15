import { afterEach, describe, expect, it } from 'vitest';

import { FrameByFrameError } from '../src/core/errors.js';
import { resolveScrollSource } from '../src/scroll/source.js';
import {
  FakeDocument,
  FakeFrameHost,
  FakeScrollElement,
  installFakeDocument,
} from './helpers/fake-scroll-source.js';

const restorers: (() => void)[] = [];

afterEach(() => {
  for (const restore of restorers.splice(0)) {
    restore();
  }
});

describe('resolveScrollSource', () => {
  it('resolves the default document and its scrolling element during mount-time work', () => {
    const frameHost = new FakeFrameHost();
    const document = new FakeDocument(frameHost);
    restorers.push(installFakeDocument(document));

    const resolved = resolveScrollSource(undefined);

    expect(resolved.key).toBe(document);
    expect(resolved.publicSource).toBe(document);
    expect(resolved.metricsTarget).toBe(document.scrollingElement);
    expect(resolved.requestFrame(() => undefined)).toBe(1);
    resolved.cancelFrame(1);
    expect(frameHost.cancelled).toEqual([1]);
  });

  it('resolves selectors and canonicalizes the document scrolling element', () => {
    const frameHost = new FakeFrameHost();
    const document = new FakeDocument(frameHost);
    document.selections.set('#page', document.documentElement);
    restorers.push(installFakeDocument(document));

    const resolved = resolveScrollSource('#page');

    expect(resolved.publicSource).toBe(document);
    expect(resolved.eventTarget).toBe(document);
  });

  it('uses documentElement when scrollingElement is unavailable', () => {
    const frameHost = new FakeFrameHost();
    const document = new FakeDocument(frameHost);
    document.scrollingElement = null;

    const resolved = resolveScrollSource(document.documentElement);

    expect(resolved.publicSource).toBe(document);
    expect(resolved.metricsTarget).toBe(document.documentElement);
  });

  it('accepts a synchronous source resolver', () => {
    const frameHost = new FakeFrameHost();
    const document = new FakeDocument(frameHost);
    const element = new FakeScrollElement();
    element.ownerDocument = document;

    expect(resolveScrollSource(() => element as unknown as HTMLElement).publicSource).toBe(element);
  });

  it('preserves causes for resolver and selector failures', () => {
    const resolverCause = new Error('resolver failed');
    const frameHost = new FakeFrameHost();
    const document = new FakeDocument(frameHost);
    const selectorCause = new Error('selector failed');
    document.selectorError = selectorCause;
    restorers.push(installFakeDocument(document));

    expect(() =>
      resolveScrollSource(() => {
        throw resolverCause;
      }),
    ).toThrow(expect.objectContaining({ code: 'SOURCE_NOT_FOUND', cause: resolverCause }));
    expect(() => resolveScrollSource('[')).toThrow(
      expect.objectContaining({ code: 'SOURCE_NOT_FOUND', cause: selectorCause }),
    );
  });

  it('reports missing and invalid sources with stable errors', () => {
    const frameHost = new FakeFrameHost();
    const document = new FakeDocument(frameHost);
    restorers.push(installFakeDocument(document));

    expect(() => resolveScrollSource('#missing')).toThrow(
      expect.objectContaining({ code: 'SOURCE_NOT_FOUND', cause: null }),
    );
    expect(() => resolveScrollSource({})).toThrow(
      expect.objectContaining({ code: 'SOURCE_NOT_FOUND' }),
    );
  });

  it('reports unavailable DOM and animation-frame capabilities', () => {
    expect(() => resolveScrollSource(undefined)).toThrow(
      expect.objectContaining({ code: 'ENVIRONMENT_UNAVAILABLE' }),
    );
    expect(() => resolveScrollSource('#source')).toThrow(
      expect.objectContaining({ code: 'ENVIRONMENT_UNAVAILABLE' }),
    );

    const document = new FakeDocument(new FakeFrameHost());
    document.defaultView = null;
    const element = new FakeScrollElement();
    element.ownerDocument = document;

    expect(() => resolveScrollSource(element as unknown as HTMLElement)).toThrow(
      expect.objectContaining({ code: 'ENVIRONMENT_UNAVAILABLE' }),
    );
  });

  it('rejects documents without usable metrics', () => {
    const document = new FakeDocument(new FakeFrameHost());
    document.scrollingElement = {} as FakeScrollElement;

    expect(() => resolveScrollSource(document as unknown as Document)).toThrow(
      expect.objectContaining({ code: 'SOURCE_NOT_FOUND' }),
    );
  });

  it('exports package errors as Error instances', () => {
    const error = new FrameByFrameError('SOURCE_NOT_FOUND', 'missing');
    expect(error).toBeInstanceOf(Error);
  });
});
