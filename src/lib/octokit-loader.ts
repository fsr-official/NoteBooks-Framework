/**
 * Load Octokit lazily so public API routes do not initialize GitHub clients
 * until a route actually needs one.
 *
 * Keep package imports literal so Vercel includes them in the serverless
 * function bundle. Vitest uses the variable import branch so module mocks work.
 */
type RuntimeImport = (specifier: string) => Promise<Record<string, any>>;

const testRuntimeImport: RuntimeImport = (specifier) => import(specifier);
const productionRuntimeImport: RuntimeImport = async (specifier) => {
  if (specifier === '@octokit/rest') return import('@octokit/rest');
  if (specifier === '@octokit/auth-app') return import('@octokit/auth-app');
  throw new Error(`Unsupported runtime import: ${specifier}`);
};
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
