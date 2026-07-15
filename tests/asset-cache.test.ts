import { describe, expect, it, vi } from 'vitest';

import { AssetCache } from '../src/media/asset-cache.js';

const request = {
  url: 'https://example.com/video.mp4',
  credentials: 'same-origin',
  cache: 'default',
} as const;

describe('full-preload asset cache', () => {
  it('shares concurrent requests and revokes the object URL after the final release', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-length': '3', 'content-type': 'video/mp4' },
        }),
      ),
    );
    const createObjectURL = vi.fn(() => 'blob:shared');
    const revokeObjectURL = vi.fn();
    const cache = new AssetCache({ fetch, createObjectURL, revokeObjectURL });
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();
    const first = cache.acquire(request, firstProgress);
    const second = cache.acquire(request, secondProgress);

    await expect(first.result).resolves.toEqual({
      objectUrl: 'blob:shared',
      size: 3,
      type: 'video/mp4',
    });
    await expect(second.result).resolves.toEqual({
      objectUrl: 'blob:shared',
      size: 3,
      type: 'video/mp4',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(firstProgress).toHaveBeenLastCalledWith({
      loadedBytes: 3,
      totalBytes: 3,
      ratio: 1,
    });
    expect(secondProgress).toHaveBeenLastCalledWith({
      loadedBytes: 3,
      totalBytes: 3,
      ratio: 1,
    });

    first.release();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    second.release();
    second.release();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shared');
  });

  it('keeps unknown totals nullable', async () => {
    const cache = new AssetCache({
      fetch: vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2])))),
      createObjectURL: vi.fn(() => 'blob:unknown'),
      revokeObjectURL: vi.fn(),
    });
    const progress = vi.fn();
    const consumer = cache.acquire(request, progress);

    await consumer.result;
    expect(progress).toHaveBeenLastCalledWith({
      loadedBytes: 2,
      totalBytes: null,
      ratio: null,
    });
    consumer.release();
  });

  it('aborts an unfinished request only after its final consumer releases', async () => {
    let signal: AbortSignal | undefined;
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const requestSignal = init.signal;

          if (requestSignal === undefined || requestSignal === null) {
            throw new Error('Expected an abort signal.');
          }

          signal = requestSignal;
          signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const cache = new AssetCache({
      fetch,
      createObjectURL: vi.fn(() => 'blob:unused'),
      revokeObjectURL: vi.fn(),
    });
    const first = cache.acquire(request, vi.fn());
    const second = cache.acquire(request, vi.fn());

    first.release();
    expect(signal?.aborted).toBe(false);
    second.release();
    expect(signal?.aborted).toBe(true);
    await expect(first.result).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second.result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not share entries with different request options', async () => {
    const fetch = vi.fn((url: string, init: RequestInit) => {
      void url;
      void init;
      return Promise.resolve(new Response(new Uint8Array([1])));
    });
    const cache = new AssetCache({
      fetch,
      createObjectURL: vi.fn(() => `blob:${String(fetch.mock.calls.length)}`),
      revokeObjectURL: vi.fn(),
    });
    const first = cache.acquire(request, vi.fn());
    const second = cache.acquire({ ...request, credentials: 'include' }, vi.fn());
    const cached = cache.acquire({ ...request, cache: 'only-if-cached' }, vi.fn());

    await Promise.all([first.result, second.result, cached.result]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({
      cache: 'only-if-cached',
      mode: 'same-origin',
    });
    first.release();
    second.release();
    cached.release();
  });
});
