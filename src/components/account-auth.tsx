"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import type { User, UserIdentity } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "register" | "account";

interface AccountAuthProps {
  mode: AuthMode;
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
  const [accountId, setAccountId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [accountLabel, setAccountLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const nextPath = safeReturnPath(searchParams.get("next"));
  const nextQuery = nextPath === "/" ? "" : `?next=${encodeURIComponent(nextPath)}`;

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
            .select("account_id")
            .eq("auth_user_id", signedInUser.id)
            .single()
            .then(({ data: account, error: accountError }) => {
              if (!active) return;
              if (accountError) {
                setError(`Unable to load account details: ${accountError.message}`);
                return;
              }
              setAccountLabel(account.account_id);
            });
        }
      })
      .catch((authError: unknown) => {
        if (!active) return;
        setError(authError instanceof Error ? authError.message : "Unable to check your sign-in status.");
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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { account_id: accountId.trim().toLowerCase() },
            emailRedirectTo: callbackUrl(nextPath),
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace(nextPath);
          return;
        }
        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        router.replace(nextPath);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to complete the request.");
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
      const options = { redirectTo: callbackUrl(link ? "/account?linked=github" : nextPath) };
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
    return (
      <AuthShell eyebrow="ACCOUNT SETTINGS" title="Your account." description="Connect GitHub for convenient sign-in, or keep using email and password. Linking is optional.">
        <div className="auth-account-summary">
          <span>EMAIL</span><strong>{user.email}</strong>
          <span>ACCOUNT ID</span><strong>{accountLabel || "Loading…"}</strong>
        </div>
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
      title={registering ? "Create your account." : "Sign in to your study space."}
      description={registering ? "Create an account with email and password. Linking GitHub is optional." : "Continue with your email, password, or GitHub."}
    >
      <button className="auth-github" type="button" disabled={busy} onClick={() => void signInWithGitHub(false)}>
        <span className="auth-provider-mark"><GitHubMark /></span>
        Continue with GitHub
      </button>
      <div className="auth-divider"><span>OR WITH EMAIL</span></div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {registering && (
          <label>
            Account ID
            <input
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}"
              required
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="e.g. alex_studies"
            />
            <small>3–32 characters; letters, numbers, underscores, and hyphens.</small>
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
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : registering ? "Create account" : "Sign in"}</button>
      </form>
      <AuthFeedback message={message || queryMessage} error={error || queryError} />
      <p className="auth-switch">
        {registering ? "Already have an account?" : "New to NoteBooks?"}{" "}
        <Link href={`${registering ? "/login" : "/register"}${nextQuery}`}>{registering ? "Sign in" : "Create an account"}</Link>
      </p>
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
        <footer className="auth-footer"><Link href="/">← Back to NoteBooks</Link><Link href="/account">Account settings</Link></footer>
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
