export type SharedCacheClient = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string, options?: { ex?: number }) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

let clientPromise: Promise<SharedCacheClient | null> | null = null;

async function createClient(): Promise<SharedCacheClient | null> {
  const url = String(process.env.KV_REST_API_URL || '').trim();
  const token = String(process.env.KV_REST_API_TOKEN || '').trim();
  if (!url || !token) return null;

  try {
    const module = await import('@upstash/redis');
    const factory = (module as { createClient?: (config: { url: string; token: string }) => SharedCacheClient }).createClient;
    return factory ? factory({ url, token }) : null;
  } catch (error) {
    console.warn('[shared-cache] Redis client unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function getSharedCacheClient(): Promise<SharedCacheClient | null> {
  if (!clientPromise) clientPromise = createClient();
  return clientPromise;
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

export async function sharedSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = await getSharedCacheClient();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    console.warn('[shared-cache] Redis SET failed:', error instanceof Error ? error.message : error);
  }
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

export function resetSharedCacheClientForTests(): void {
  clientPromise = null;
}

export function setSharedCacheClientForTests(client: SharedCacheClient | null): void {
  clientPromise = Promise.resolve(client);
}
