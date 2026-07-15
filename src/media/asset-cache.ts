export interface AssetLoadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
  readonly ratio: number | null;
}

export interface AssetRequest {
  readonly url: string;
  readonly credentials: RequestCredentials;
  readonly cache: RequestCache;
}

export interface LoadedAsset {
  readonly objectUrl: string;
  readonly size: number;
  readonly type: string;
}

export interface AssetConsumer {
  readonly result: Promise<LoadedAsset>;
  release(): void;
}

export interface AssetCacheDependencies {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
}

interface CacheEntry {
  readonly key: string;
  readonly request: AssetRequest;
  readonly abortController: AbortController;
  readonly listeners: Set<(progress: AssetLoadProgress) => void>;
  references: number;
  progress: AssetLoadProgress;
  asset: LoadedAsset | null;
  result: Promise<LoadedAsset>;
}

const initialProgress = (): AssetLoadProgress =>
  Object.freeze({ loadedBytes: 0, totalBytes: null, ratio: null });

const readTotalBytes = (response: Response): number | null => {
  const header = response.headers.get('content-length');

  if (header === null) {
    return null;
  }

  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const calculateRatio = (loadedBytes: number, totalBytes: number | null): number | null =>
  totalBytes !== null && totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : null;

const cacheKey = (request: AssetRequest): string =>
  JSON.stringify([request.url, request.credentials, request.cache]);

/** Internal reference-counted cache used only by explicit full-file preloads. */
export class AssetCache {
  readonly #dependencies: AssetCacheDependencies;
  readonly #entries = new Map<string, CacheEntry>();

  constructor(dependencies: AssetCacheDependencies) {
    this.#dependencies = dependencies;
  }

  acquire(request: AssetRequest, onProgress: (progress: AssetLoadProgress) => void): AssetConsumer {
    const key = cacheKey(request);
    let entry = this.#entries.get(key);

    if (entry === undefined) {
      entry = this.#createEntry(key, request);
      this.#entries.set(key, entry);
    }

    entry.references += 1;
    entry.listeners.add(onProgress);
    onProgress(entry.progress);
    let released = false;

    return {
      result: entry.result,
      release: (): void => {
        if (released) {
          return;
        }

        released = true;
        entry.listeners.delete(onProgress);
        this.#release(entry);
      },
    };
  }

  #createEntry(key: string, request: AssetRequest): CacheEntry {
    const entry: CacheEntry = {
      key,
      request,
      abortController: new AbortController(),
      listeners: new Set(),
      references: 0,
      progress: initialProgress(),
      asset: null,
      result: Promise.resolve(null as never),
    };

    entry.result = this.#load(entry).catch((error: unknown): never => {
      if (this.#entries.get(key) === entry) {
        this.#entries.delete(key);
      }

      throw error;
    });
    return entry;
  }

  async #load(entry: CacheEntry): Promise<LoadedAsset> {
    const response = await this.#dependencies.fetch(entry.request.url, {
      signal: entry.abortController.signal,
      credentials: entry.request.credentials,
      cache: entry.request.cache,
      mode: entry.request.cache === 'only-if-cached' ? 'same-origin' : 'cors',
    });

    if (!response.ok) {
      throw new Error(`Full preload request failed with HTTP ${String(response.status)}.`);
    }

    const totalBytes = readTotalBytes(response);
    this.#publish(entry, 0, totalBytes);
    const blob = await this.#readBlob(entry, response, totalBytes);
    const objectUrl = this.#dependencies.createObjectURL(blob);
    const asset = Object.freeze({ objectUrl, size: blob.size, type: blob.type });
    entry.asset = asset;
    this.#publish(entry, blob.size, totalBytes);
    return asset;
  }

  async #readBlob(entry: CacheEntry, response: Response, totalBytes: number | null): Promise<Blob> {
    if (response.body === null) {
      const blob = await response.blob();
      this.#publish(entry, blob.size, totalBytes);
      return blob;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let loadedBytes = 0;

    try {
      for (;;) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        const bytes = new Uint8Array(chunk.value);
        chunks.push(bytes);
        loadedBytes += bytes.byteLength;
        this.#publish(entry, loadedBytes, totalBytes);
      }
    } finally {
      reader.releaseLock();
    }

    return new Blob(chunks, {
      type: response.headers.get('content-type') ?? '',
    });
  }

  #publish(entry: CacheEntry, loadedBytes: number, totalBytes: number | null): void {
    const progress = Object.freeze({
      loadedBytes,
      totalBytes,
      ratio: calculateRatio(loadedBytes, totalBytes),
    });
    entry.progress = progress;

    for (const listener of entry.listeners) {
      listener(progress);
    }
  }

  #release(entry: CacheEntry): void {
    entry.references -= 1;

    if (entry.references > 0) {
      return;
    }

    if (this.#entries.get(entry.key) === entry) {
      this.#entries.delete(entry.key);
    }

    if (entry.asset === null) {
      entry.abortController.abort();
      return;
    }

    this.#dependencies.revokeObjectURL(entry.asset.objectUrl);
  }
}
