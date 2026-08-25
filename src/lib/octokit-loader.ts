/**
 * Load Octokit’s ESM-only packages without creating a CommonJS require at
 * module initialization. Vercel’s Node function wrapper can execute native
 * dynamic imports from the CommonJS server output, but cannot require these
 * packages because their exports are ESM-only.
 */
export async function createOctokit(options: Record<string, unknown> = {}) {
  const { Octokit } = await import('@octokit/rest');
  return new Octokit(options as any);
}

export async function loadCreateAppAuth() {
  const { createAppAuth } = await import('@octokit/auth-app');
  return createAppAuth;
}
