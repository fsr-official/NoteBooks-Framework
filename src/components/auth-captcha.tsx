"use client";

import { Turnstile } from "@marsidev/react-turnstile";

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
const isProduction = process.env.NODE_ENV === "production";

export function AuthCaptcha({
  action,
  onVerify,
  onError,
}: {
  action: string;
  onVerify: (token: string) => void;
  onError: (message: string) => void;
}) {
  if (!siteKey) {
    return isProduction
      ? <p className="auth-captcha-message" role="alert">Security verification is not configured for this deployment.</p>
      : null;
  }

  return (
    <div className="auth-captcha">
      <Turnstile
        siteKey={siteKey}
        options={{ action }}
        onSuccess={onVerify}
        onExpire={() => onVerify("")}
        onError={() => {
          onVerify("");
          onError("Security verification failed to load. Please refresh the page and try again.");
        }}
      />
    </div>
  );
}
