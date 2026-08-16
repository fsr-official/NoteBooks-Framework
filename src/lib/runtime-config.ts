type RuntimeConfigErrors = string[];

const DEV_DEFAULTS = {
  JWT_SECRET: 'dev-secret-key-do-not-use-in-production',
  GITHUB_REPO: 'fsr-science/NCERT-Science',
  GITHUB_COMMUNITY_REPO: 'fsr-official/NoteBooks-Community',
  GITHUB_ISSUES_REPO: 'fsr-official/NoteBooks-Issues',
  WORKSPACE: 'NoteBooks-Framework',
};

export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfigErrors {
  const errors: string[] = [];
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase();
  const isProduction = nodeEnv === 'production';

  const required = [
    { key: 'JWT_SECRET', allowDefault: !isProduction },
    { key: 'GITHUB_REPO', allowDefault: !isProduction },
    { key: 'GITHUB_COMMUNITY_REPO', allowDefault: !isProduction },
    { key: 'GITHUB_ISSUES_REPO', allowDefault: !isProduction },
  ] as const;

  if (isProduction) {
    for (const item of required) {
      const value = env[item.key]?.trim();
      if (!value) {
        errors.push(`${item.key} is required in production`);
      }
    }

    if (!env.DATABASE_URL) {
      errors.push('DATABASE_URL is required in production');
    }

    if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_APP_INSTALLATION_ID) {
      errors.push('GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID) are required in production');
    }
  } else {
    for (const [key, fallback] of Object.entries(DEV_DEFAULTS)) {
      if (!env[key]) {
        env[key] = fallback;
      }
    }
  }

  return errors;
}

export function assertRuntimeConfig(env: NodeJS.ProcessEnv = process.env): void {
  const errors = validateRuntimeConfig(env);
  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration: ${errors.join('; ')}`);
  }
}

export default {
  validateRuntimeConfig,
  assertRuntimeConfig,
};
