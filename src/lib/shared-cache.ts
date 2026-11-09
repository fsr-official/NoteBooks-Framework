import { Redis } from '@upstash/redis';

export type SharedCacheClient = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string, options?: { ex?: number; nx?: boolean }) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

let clientPromise: Promise<SharedCacheClient | null> | null = null;

async function createClient(): Promise<SharedCacheClient | null> {
  const url = String(process.env.KV_REST_API_URL || '').trim();
  const token = String(process.env.KV_REST_API_TOKEN || '').trim();
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  return {
    get: (key) => redis.get(key),
    set: (key, value, options) => {
      if (options?.ex !== undefined && options.nx) {
        return redis.set(key, value, { ex: options.ex, nx: true });
      }
      if (options?.ex !== undefined) return redis.set(key, value, { ex: options.ex });
      if (options?.nx) return redis.set(key, value, { nx: true });
      return redis.set(key, value);
    },
    del: (key) => redis.del(key)
  };
}

export async function getSharedCacheClient(): Promise<SharedCacheClient | null> {
  if (!clientPromise) clientPromise = createClient();
  return clientPromise;
}

async function requireSharedCacheClient(): Promise<SharedCacheClient> {
  const client = await getSharedCacheClient();
  if (!client) throw new Error('Upstash Redis is not configured or unavailable');
  return client;
}

export async function sharedGetJson<T>(key: string): Promise<T | null> {
  const client = await getSharedCacheClient();
  if (!client) return null;

  try {
    const value = await client.get(key);
    if (value == null) return null;
    if (typeof value !== 'string') return value as T;
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn('[shared-cache] Redis GET failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function sharedGetJsonRequired<T>(key: string): Promise<T | null> {
  const client = await requireSharedCacheClient();
  const value = await client.get(key);
  if (value == null) return null;
  return typeof value === 'string' ? JSON.parse(value) as T : value as T;
}

export async function sharedSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = await getSharedCacheClient();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    console.warn('[shared-cache] Redis SET failed:', error instanceof Error ? error.message : error);
  }
}

export async function sharedSetJsonRequired(key: string, value: unknown): Promise<void> {
  const client = await requireSharedCacheClient();
  await client.set(key, JSON.stringify(value));
}

export async function sharedTryAcquire(key: string, owner: string, ttlSeconds: number): Promise<boolean> {
  const client = await getSharedCacheClient();
  if (!client) return true;
  try {
    const result = await client.set(key, owner, { ex: ttlSeconds, nx: true });
    return result === 'OK' || result === true;
  } catch (error) {
    console.warn('[shared-cache] Redis lock acquire failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function sharedTryAcquireRequired(key: string, owner: string, ttlSeconds: number): Promise<boolean> {
  const client = await requireSharedCacheClient();
  const result = await client.set(key, owner, { ex: ttlSeconds, nx: true });
  return result === 'OK' || result === true;
}

export async function sharedRelease(key: string, owner: string): Promise<void> {
  const client = await getSharedCacheClient();
  if (!client) return;
  try {
    const current = await client.get(key);
    if (current === owner) await client.del(key);
  } catch (error) {
    console.warn('[shared-cache] Redis lock release failed:', error instanceof Error ? error.message : error);
  }
}

export async function sharedReleaseRequired(key: string, owner: string): Promise<void> {
  const client = await requireSharedCacheClient();
  if (await client.get(key) === owner) await client.del(key);
}

export async function sharedDelete(key: string): Promise<void> {
  const client = await getSharedCacheClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    console.warn('[shared-cache] Redis DEL failed:', error instanceof Error ? error.message : error);
  }
}

export async function sharedDeleteRequired(key: string): Promise<void> {
  const client = await requireSharedCacheClient();
  await client.del(key);
}

export function resetSharedCacheClientForTests(): void {
  clientPromise = null;
}

export function setSharedCacheClientForTests(client: SharedCacheClient | null): void {
  clientPromise = Promise.resolve(client);
}
