interface CacheEntry {
  body: Uint8Array;
  expiresAt: number;
}

interface PdfCacheState {
  entries: Map<string, CacheEntry>;
  inFlight: Map<string, Promise<Uint8Array>>;
  totalBytes: number;
}

const CACHE_MAX_BYTES = 64 * 1024 * 1024;
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const CACHE_STATE_KEY = "__notebooksVerifiedPdfCache";

function getState(): PdfCacheState {
  const globalCache = globalThis as typeof globalThis & { [CACHE_STATE_KEY]?: PdfCacheState };
  if (!globalCache[CACHE_STATE_KEY]) {
    globalCache[CACHE_STATE_KEY] = {
      entries: new Map(),
      inFlight: new Map(),
      totalBytes: 0,
    };
  }
  return globalCache[CACHE_STATE_KEY];
}

function removeEntry(state: PdfCacheState, key: string): void {
  const entry = state.entries.get(key);
  if (!entry) return;
  state.totalBytes -= entry.body.byteLength;
  state.entries.delete(key);
}

export async function getOrFetchVerifiedPdf(
  fileSha: string,
  fetchVerified: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const state = getState();
  const cached = state.entries.get(fileSha);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      state.entries.delete(fileSha);
      state.entries.set(fileSha, cached);
      return cached.body;
    }
    removeEntry(state, fileSha);
  }

  const pending = state.inFlight.get(fileSha);
  if (pending) return pending;

  const operation = fetchVerified().then((body) => {
    if (body.byteLength <= CACHE_MAX_BYTES) {
      removeEntry(state, fileSha);
      while (state.totalBytes + body.byteLength > CACHE_MAX_BYTES) {
        const oldestKey = state.entries.keys().next().value;
        if (oldestKey === undefined) break;
        removeEntry(state, oldestKey);
      }
      state.entries.set(fileSha, { body, expiresAt: Date.now() + CACHE_MAX_AGE_MS });
      state.totalBytes += body.byteLength;
    }
    return body;
  });
  state.inFlight.set(fileSha, operation);
  try {
    return await operation;
  } finally {
    if (state.inFlight.get(fileSha) === operation) state.inFlight.delete(fileSha);
  }
}
