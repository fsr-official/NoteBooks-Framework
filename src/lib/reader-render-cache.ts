const DATABASE_NAME = "notebooks-reader-render-cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "rendered-notes";
const MAX_ENTRIES = 12;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;

type CacheRecord = {
  key: string;
  html: string;
  size: number;
  accessedAt: number;
};

export type ReaderRenderIdentity = {
  owner: string;
  repository: string;
  path: string;
  revision: string;
  renderer: "client-markdown" | "server-markdown" | "precompiled-html";
};

let databasePromise: Promise<IDBDatabase | null> | null = null;

export function readerRenderCacheKey(identity: ReaderRenderIdentity): string | null {
  const { owner, repository, path, revision, renderer } = identity;
  if (!owner || !repository || !path || !revision) return null;
  return [
    "v1",
    renderer,
    encodeURIComponent(owner),
    encodeURIComponent(repository),
    encodeURIComponent(path),
    encodeURIComponent(revision),
  ].join(":");
}

export async function readerSourceRevision(
  knownRevision: string | null | undefined,
  source: string,
): Promise<string | null> {
  const revision = knownRevision?.trim();
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const sourceHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return revision ? `${revision}:${sourceHash}` : sourceHash;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return databasePromise;
}

export async function readRenderedNote(key: string | null): Promise<string | null> {
  if (!key) return null;
  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      let html: string | null = null;
      request.onsuccess = () => {
        const record = request.result as CacheRecord | undefined;
        if (!record || typeof record.html !== "string" || record.key !== key) return;
        html = record.html;
        store.put({ ...record, accessedAt: Date.now() });
      };
      transaction.oncomplete = () => resolve(html);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeRenderedNote(key: string | null, html: string): Promise<void> {
  if (!key || !html) return;
  const size = html.length * 2;
  if (size > MAX_ENTRY_BYTES) return;
  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put({ key, html, size, accessedAt: Date.now() } satisfies CacheRecord);
      const all = store.getAll();
      all.onsuccess = () => {
        const records = (all.result as CacheRecord[])
          .filter((record) => record && typeof record.key === "string" && typeof record.html === "string")
          .sort((left, right) => right.accessedAt - left.accessedAt);
        let totalBytes = 0;
        let count = 0;
        for (const record of records) {
          const recordBytes = Number.isFinite(record.size) ? record.size : record.html.length * 2;
          count += 1;
          totalBytes += recordBytes;
          if (count > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) store.delete(record.key);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
