interface AuthCaptchaConfig {
  siteKey: string;
  isProduction: boolean;
}

export function getAuthCaptchaToken(
  token: string,
  { siteKey, isProduction }: AuthCaptchaConfig,
): string | undefined {
  if (!siteKey && !isProduction) return undefined;
  if (!siteKey) {
    throw new Error("Security verification is not configured for this deployment. Please try again later.");
  }
  if (!token) {
    throw new Error("Complete the security check before continuing.");
  }
  return token;
}

