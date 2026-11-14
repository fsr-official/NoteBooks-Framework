import { afterEach, describe, expect, it } from 'vitest';
import {
  getSharedCacheClient,
  resetSharedCacheClientForTests,
  setSharedCacheClientForTests,
  sharedDelete,
  sharedGetJson,
  sharedSetJson
} from '../src/lib/shared-cache.ts';

const originalKvUrl = process.env.KV_REST_API_URL;
const originalKvToken = process.env.KV_REST_API_TOKEN;

describe('shared cache adapter', () => {
  afterEach(() => {
    resetSharedCacheClientForTests();
    if (originalKvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = originalKvUrl;
    if (originalKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = originalKvToken;
  });

  it('creates a cache client from the configured Upstash REST credentials', async () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    await expect(getSharedCacheClient()).resolves.toMatchObject({
      get: expect.any(Function),
      set: expect.any(Function),
      del: expect.any(Function)
    });
  });

  it('round-trips JSON values with an expiration option and deletes them', async () => {
    const store = new Map<string, string>();
    let receivedTtl: number | undefined;
    setSharedCacheClientForTests({
      async get(key) {
        return store.get(key) ?? null;
      },
      async set(key, value, options) {
        store.set(key, value);
        receivedTtl = options?.ex;
      },
      async del(key) {
        store.delete(key);
      }
    });

    await sharedSetJson('subject:science', { subject: 'science', repos: [] }, 300);
    expect(receivedTtl).toBe(300);
    await expect(sharedGetJson('subject:science')).resolves.toEqual({ subject: 'science', repos: [] });

    await sharedDelete('subject:science');
    await expect(sharedGetJson('subject:science')).resolves.toBeNull();
  });

  it('falls back to no shared cache when no client is configured', async () => {
    setSharedCacheClientForTests(null);
    await expect(sharedGetJson('missing')).resolves.toBeNull();
    await expect(sharedSetJson('missing', { value: true }, 300)).resolves.toBeUndefined();
    await expect(sharedDelete('missing')).resolves.toBeUndefined();
  });
});
