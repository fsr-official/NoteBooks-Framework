"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import type { User, UserIdentity } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AuthCaptcha } from "@/components/auth-captcha";
import { getAuthCaptchaToken } from "@/lib/auth-captcha";
import {
  bindAuthenticatedClientSession,
  clearAuthenticatedClientIdentity,
  updateAuthenticatedClientProfile,
} from "@/lib/client-session";

type AuthMode = "login" | "register" | "account";

interface AccountAuthProps {
  mode: AuthMode;
}

async function saveUserName(event: FormEvent<HTMLFormElement>, state: {
  accountLabel: string;
  accountUserName: string;
  setAccountUserName: (value: string) => void;
  setBusy: (value: boolean) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
}) {
  const { accountLabel, accountUserName, setAccountUserName, setBusy, setError, setMessage } = state;
  event.preventDefault();
  setBusy(true);
  setMessage("");
  setError("");
  try {
    const { data: sessionData, error: sessionError } = await getSupabaseBrowserClient().auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) throw new Error("Your session expired. Sign in again to continue.");

    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionData.session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ userName: accountUserName }),
    });
    const result = await response.json() as { accountId?: string; userName?: string; error?: string };
    if (!response.ok) throw new Error(result.error || "Unable to update your User Name.");
    if (result.userName) {
      setAccountUserName(result.userName);
      updateAuthenticatedClientProfile(result.accountId || accountLabel, result.userName);
    }
    setMessage("Your User Name was updated.");
  } catch (authError) {
    setError(authError instanceof Error ? authError.message : "Unable to update your User Name.");
  } finally {
    setBusy(false);
  }
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" className="github-mark" viewBox="0 0 16 16">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.7-.95-2.7-.95-.36-.92-.89-1.16-.89-1.16-.73-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.72 1.22 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.96 0-.88.31-1.6.82-2.17-.08-.2-.36-1.03.08-2.14 0 0 .67-.21 2.2.83A7.65 7.65 0 0 1 8 4.32c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.83 2.2-.83.44 1.11.16 1.94.08 2.14.51.57.82 1.29.82 2.17 0 3.08-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function callbackUrl(next: string): string {
  const query = new URLSearchParams({ next });
  return `${window.location.origin}/auth/callback?${query.toString()}`;
}

function safeReturnPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function AuthContent({ mode }: AccountAuthProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [userName, setUserName] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [pendingSignupOtp, setPendingSignupOtp] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [accountLabel, setAccountLabel] = useState("");
  const [accountUserName, setAccountUserName] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const nextPath = safeReturnPath(searchParams.get("next"));
  const nextQuery = nextPath === "/" ? "" : `?next=${encodeURIComponent(nextPath)}`;
  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

  function authCaptchaToken(): string | undefined {
    return getAuthCaptchaToken(captchaToken, {
      siteKey: captchaSiteKey,
      isProduction: process.env.NODE_ENV === "production",
    });
  }

  function resetCaptcha() {
    setCaptchaToken("");
    setCaptchaResetKey((current) => current + 1);
  }

  async function checkAuthRateLimit(action: string) {
    const response = await fetch("/api/account/auth-rate-limit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      throw new Error(result.error || "Authentication is temporarily unavailable.");
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(async () => {
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          if (active) setUser(null);
          return null;
        }
        return supabase.auth.getUser();
      })
      .then((response) => {
        if (!response) return;
        const { data, error: authError } = response;
        if (authError) throw authError;
        const signedInUser = data.user;
        if (!active) return;
        setUser(signedInUser);
        setIdentities(signedInUser?.identities ?? []);
        if (mode === "account" && signedInUser) {
          void getSupabaseBrowserClient()
            .from("accounts")
            .select("account_id, user_name")
            .eq("auth_user_id", signedInUser.id)
            .single()
            .then(({ data: account, error: accountError }) => {
              if (!active) return;
              if (accountError) {
                setError(`Unable to load account details: ${accountError.message}`);
                return;
              }
              setAccountLabel(account.account_id);
              setAccountUserName(account.user_name);
            });
        }
      })
      .catch((authError: unknown) => {
        if (!active) return;
        setError(authError instanceof Error ? authError.message : "Unable to check your sign-in status.");
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, [mode]);

  const queryMessage = searchParams.get("linked") === "github" ? "GitHub is linked to your account." : "";
  const queryError = searchParams.get("error") ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "register") {
        if (pendingSignupOtp) {
          await checkAuthRateLimit("signup-code-verify");
          const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: signupOtp.trim(),
            type: "signup",
          });
          if (verifyError) throw verifyError;
          if (!verifyData.session) throw new Error("Email verification succeeded, but no sign-in session was created.");
          await bindAuthenticatedClientSession(verifyData.session.access_token);
          router.replace(nextPath);
          return;
        }
        await checkAuthRateLimit("email-signup");
        const captchaToken = authCaptchaToken();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              account_id: accountId.trim().toLowerCase(),
              user_name: userName.trim(),
            },
            emailRedirectTo: callbackUrl(nextPath),
            captchaToken,
          },
        });
        if (signUpError) throw signUpError;
        if (data.user && data.user.identities?.length === 0) {
          setError("We couldn’t request a new confirmation code. This email may already have an account—try signing in instead.");
          return;
        }
        if (data.session) {
          await bindAuthenticatedClientSession(data.session.access_token);
          router.replace(nextPath);
          return;
        }
        setPendingSignupOtp(true);
        setMessage(`We sent an eight-digit confirmation code to ${email.trim()}. Look for “Confirm your NoteBooks account,” then enter the code below.`);
      } else {
        await checkAuthRateLimit("password-login");
        const captchaToken = authCaptchaToken();
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: { captchaToken },
        });
        if (signInError) throw signInError;
        if (!signInData.session) throw new Error("Sign-in succeeded, but no session was created.");
        await bindAuthenticatedClientSession(signInData.session.access_token);
        router.replace(nextPath);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to complete the request.");
    } finally {
      if (mode !== "account" && !pendingSignupOtp) resetCaptcha();
      setBusy(false);
    }
  }

  async function resendSignupOtp() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await checkAuthRateLimit("signup-code-resend");
      const captchaToken = authCaptchaToken();
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl(nextPath), captchaToken },
      });
      if (resendError) throw resendError;
      setMessage(`A new eight-digit confirmation code was sent to ${email.trim()}. Look for “Confirm your NoteBooks account.”`);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to resend the confirmation code.");
    } finally {
      resetCaptcha();
      setBusy(false);
    }
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await checkAuthRateLimit("password-reset");
      const captchaToken = authCaptchaToken();
      const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: callbackUrl("/account/settings?recovery=1"),
          captchaToken,
        },
      );
      if (resetError) throw resetError;
      setMessage(`If an account exists for ${email.trim()}, a password reset link will be sent.`);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to request a password reset.");
    } finally {
      resetCaptcha();
      setBusy(false);
    }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const captchaToken = authCaptchaToken();
      const supabase = getSupabaseBrowserClient();
      if (captchaToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) throw new Error("Your session expired. Sign in again to continue.");
        const response = await fetch("/api/account/email", {
          method: "POST",
          headers: {
            authorization: `Bearer ${sessionData.session.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ captchaToken }),
        });
        const result = await response.json() as { verified?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to change your email address.");
        if (result.verified !== true) throw new Error("Security verification failed. Please complete the check again.");
      }
      const { error: emailError } = await supabase.auth.updateUser(
        { email: newEmail.trim() },
        { emailRedirectTo: callbackUrl("/account/settings") },
      );
      if (emailError) throw emailError;
      setMessage(`Check ${newEmail.trim()} for a confirmation link to finish changing your email address.`);
      setNewEmail("");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to change your email address.");
    } finally {
      resetCaptcha();
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const { error: passwordError } = await getSupabaseBrowserClient().auth.updateUser({ password: newPassword });
      if (passwordError) throw passwordError;
      setNewPassword("");
      setMessage("Your password was updated.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to update your password.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGitHub(link: boolean) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const options = { redirectTo: callbackUrl(link ? "/account/settings?linked=github" : nextPath) };
      const { error: oauthError } = link
        ? await supabase.auth.linkIdentity({ provider: "github", options })
        : await supabase.auth.signInWithOAuth({ provider: "github", options });
      if (oauthError) throw oauthError;
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to start GitHub authentication.");
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      clearAuthenticatedClientIdentity();
      setUser(null);
      setIdentities([]);
      setMessage("You are signed out.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "account") {
    if (authLoading) {
      return (
        <AuthShell eyebrow="YOUR ACCOUNT" title="Checking your sign-in." description="Please wait while we verify your account session.">
          <span className="loading-spinner" />
        </AuthShell>
      );
    }
    if (!user) {
      return (
        <AuthShell eyebrow="YOUR ACCOUNT" title="Sign in to manage linking." description="GitHub linking is optional and can be added after you sign in.">
          <div className="account-auth-actions">
            <Link className="auth-submit" href="/login">Sign in</Link>
            <Link className="auth-secondary" href="/register">Create an account</Link>
          </div>
          <AuthFeedback message={message || queryMessage} error={error || queryError} />
        </AuthShell>
      );
    }
    const githubLinked = identities.some((identity) => identity.provider === "github");
    const recoveringPassword = searchParams.get("recovery") === "1";
    return (
      <AuthShell eyebrow="ACCOUNT SETTINGS" title="Your account." description="Connect GitHub for convenient sign-in, or keep using email and password. Linking is optional.">
        <div className="auth-account-summary">
          <span>EMAIL</span><strong>{user.email}</strong>
          <span>USER ID</span><strong>{accountLabel || "Loading…"}</strong>
        </div>
        <form className="auth-form" onSubmit={(event) => void saveUserName(event, {
          accountLabel,
          accountUserName,
          setAccountUserName,
          setBusy,
          setError,
          setMessage,
        })}>
          <label>
            User Name
            <input
              autoComplete="nickname"
              maxLength={40}
              required
              value={accountUserName}
              onChange={(event) => setAccountUserName(event.target.value)}
              placeholder="Your display name"
            />
            <small>Editable and not unique; your User ID remains permanent.</small>
          </label>
          <button className="auth-submit" type="submit" disabled={busy || authLoading || !accountLabel}>
            {busy ? "Saving…" : "Save User Name"}
          </button>
        </form>
        <form className="auth-form auth-account-form" onSubmit={(event) => void changeEmail(event)}>
          <label>
            Change email address
            <input
              autoComplete="email"
              type="email"
              required
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="new-address@example.com"
            />
          </label>
          <AuthCaptcha
            action="email-change"
            key={`email-${captchaResetKey}`}
            onVerify={setCaptchaToken}
            onError={setError}
          />
          <button className="auth-submit" type="submit" disabled={busy || authLoading}>
            {busy ? "Please wait…" : "Send email change link"}
          </button>
        </form>
        <form className="auth-form auth-account-form" onSubmit={(event) => void changePassword(event)}>
          {recoveringPassword && <p className="auth-description">Choose a new password to complete your reset.</p>}
          <label>
            {recoveringPassword ? "New password" : "Set or change password"}
            <input
              autoComplete="new-password"
              type="password"
              minLength={8}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <button className="auth-submit" type="submit" disabled={busy || authLoading}>
            {busy ? "Please wait…" : "Update password"}
          </button>
        </form>
        <div className="auth-provider-status">
          <span className="auth-provider-mark"><GitHubMark /></span>
          <span><strong>GitHub</strong><small>{githubLinked ? "Linked to this account" : "Not linked"}</small></span>
          {githubLinked
            ? <span className="auth-linked">LINKED</span>
            : <button className="auth-link-button" type="button" disabled={busy} onClick={() => void signInWithGitHub(true)}>Link GitHub</button>}
        </div>
        <AuthFeedback message={message || queryMessage} error={error || queryError} />
        <button className="auth-secondary auth-signout" type="button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
      </AuthShell>
    );
  }

  const registering = mode === "register";
  return (
    <AuthShell
      eyebrow={registering ? "JOIN NOTEBOOKS" : "WELCOME BACK"}
      title={pendingSignupOtp ? "Check your email." : registering ? "Create your account." : "Sign in to your study space."}
      description={pendingSignupOtp
        ? `Enter the confirmation code sent to ${email}.`
        : registering
          ? "Create an account with email and password. Linking GitHub is optional."
          : "Continue with your email, password, or GitHub."}
    >
      {pendingSignupOtp ? (
        <>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              Confirmation code
              <input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={8}
                minLength={8}
                pattern="[0-9]{8}"
                required
                value={signupOtp}
                onChange={(event) => setSignupOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="8-digit code"
              />
              <small>Can’t find the email? Check your Spam or Junk folder.</small>
            </label>
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify email"}</button>
          </form>
          <div className="account-auth-actions">
            <AuthCaptcha
              action="signup-code-resend"
              key={`resend-${captchaResetKey}`}
              onVerify={setCaptchaToken}
              onError={setError}
            />
            <button className="auth-secondary" type="button" disabled={busy} onClick={() => void resendSignupOtp()}>Resend code</button>
            <button className="auth-secondary" type="button" disabled={busy} onClick={() => { setPendingSignupOtp(false); setSignupOtp(""); setMessage(""); setError(""); }}>Change email</button>
          </div>
        </>
      ) : (
        <>
          {forgotPassword ? (
            <>
              <form className="auth-form" onSubmit={(event) => void requestPasswordReset(event)}>
                <label>
                  Email
                  <input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                </label>
                <AuthCaptcha
                  action="password-reset"
                  key={`reset-${captchaResetKey}`}
                  onVerify={setCaptchaToken}
                  onError={setError}
                />
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : "Send password reset link"}</button>
              </form>
              <button className="auth-secondary" type="button" onClick={() => { setForgotPassword(false); setMessage(""); setError(""); }}>Back to sign in</button>
            </>
          ) : (
            <>
              <button className="auth-github" type="button" disabled={busy} onClick={() => void signInWithGitHub(false)}>
                <span className="auth-provider-mark"><GitHubMark /></span>
                Continue with GitHub
              </button>
              <div className="auth-divider"><span>OR WITH EMAIL</span></div>
              <form className="auth-form" onSubmit={(event) => void submit(event)}>
                {registering && (
                  <label>
                    User ID
                    <input
                      autoComplete="username"
                      minLength={3}
                      maxLength={32}
                      pattern="[a-zA-Z0-9](?:[a-zA-Z0-9_]|-){2,31}"
                      required
                      value={accountId}
                      onChange={(event) => setAccountId(event.target.value)}
                      placeholder="e.g. alex_studies"
                    />
                    <small>3–32 characters; letters, numbers, underscores, and hyphens.</small>
                  </label>
                )}
                {registering && (
                  <label>
                    User Name
                    <input
                      autoComplete="nickname"
                      maxLength={40}
                      required
                      value={userName}
                      onChange={(event) => setUserName(event.target.value)}
                      placeholder="Your display name"
                    />
                    <small>Editable later and not required to be unique.</small>
                  </label>
                )}
                <label>
                  Email
                  <input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                </label>
                <label>
                  Password
                  <input autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 8 : undefined} type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? "At least 8 characters" : "Your password"} />
                </label>
                {(registering || mode === "login") && (
                  <AuthCaptcha
                    action={registering ? "signup" : "password-login"}
                    key={`${registering ? "signup" : "login"}-${captchaResetKey}`}
                    onVerify={setCaptchaToken}
                    onError={setError}
                  />
                )}
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : registering ? "Create account" : "Sign in"}</button>
              </form>
              {!registering && (
                <button className="auth-secondary" type="button" disabled={busy} onClick={() => { setForgotPassword(true); setMessage(""); setError(""); }}>
                  Forgot password?
                </button>
              )}
            </>
          )}
        </>
      )}
      <AuthFeedback message={message || queryMessage} error={error || queryError} />
      {!pendingSignupOtp && (
        <p className="auth-switch">
          {registering ? "Already have an account?" : "New to NoteBooks?"}{" "}
          <Link href={`${registering ? "/login" : "/register"}${nextQuery}`}>{registering ? "Sign in" : "Create an account"}</Link>
        </p>
      )}
    </AuthShell>
  );
}

function AuthShell({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="NoteBooks home">
          <span className="brand-mark">n</span><span>NoteBooks</span>
        </Link>
        <span className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</span>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
        <footer className="auth-footer"><Link href="/">← Back to NoteBooks</Link><Link href="/account">Anonymous dashboard</Link></footer>
      </section>
    </main>
  );
}

function AuthFeedback({ message, error }: { message: string; error: string }) {
  return (
    <>
      {message && <p className="auth-feedback auth-success" role="status">{message}</p>}
      {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
    </>
  );
}

function AccountAuthPage({ mode }: AccountAuthProps) {
  return <Suspense fallback={<div className="auth-page"><div className="auth-card">Loading account…</div></div>}><AuthContent mode={mode} /></Suspense>;
}

export function LoginPage() {
  return <AccountAuthPage mode="login" />;
}

export function RegisterPage() {
  return <AccountAuthPage mode="register" />;
}

export function AccountPage() {
  return <AccountAuthPage mode="account" />;
}
