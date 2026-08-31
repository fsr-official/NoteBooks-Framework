/**
 * Load Octokit lazily so public API routes do not initialize GitHub clients
 * until a route actually needs one.
 *
 * Vercel may bundle the CommonJS server entrypoint and rewrite ordinary
 * dynamic imports into require(). The production loader keeps the import
 * expression opaque so native Node ESM loading is used even if an old ESM-only
 * package remains in a provider cache. Vitest uses the ordinary branch so its
 * module mocks continue to work.
 */
type RuntimeImport = (specifier: string) => Promise<Record<string, any>>;

const testRuntimeImport: RuntimeImport = (specifier) => import(specifier);
const productionRuntimeImport = new Function('specifier', 'return import(specifier);') as RuntimeImport;
const isTestRuntime = typeof process !== 'undefined' && Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
const runtimeImport = isTestRuntime ? testRuntimeImport : productionRuntimeImport;

export async function createOctokit(options: Record<string, unknown> = {}) {
  const { Octokit } = await runtimeImport('@octokit/rest');
  return new Octokit(options as any);
}

export async function loadCreateAppAuth() {
  const { createAppAuth } = await runtimeImport('@octokit/auth-app');
  return createAppAuth;
}
