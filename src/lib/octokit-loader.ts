/**
 * Load Octokit lazily so public API routes do not initialize GitHub clients
 * until a route actually needs one. The pinned releases are CommonJS-compatible
 * with Vercel’s server function wrapper while remaining usable through dynamic
 * import from the TypeScript server build.
 */
export async function createOctokit(options: Record<string, unknown> = {}) {
  const { Octokit } = await import('@octokit/rest');
  return new Octokit(options as any);
}

export async function loadCreateAppAuth() {
  const { createAppAuth } = await import('@octokit/auth-app');
  return createAppAuth;
}
