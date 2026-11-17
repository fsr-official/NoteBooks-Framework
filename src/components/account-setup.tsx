"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { updateAuthenticatedClientProfile } from "@/lib/client-session";

function safeReturnPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function isGeneratedAccountId(accountId: string): boolean {
  return /^user-[a-f0-9]{12}$/.test(accountId);
}

function AccountSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeReturnPath(searchParams.get("next"));
  const suggestedId = searchParams.get("suggested");
  const [accountId, setAccountId] = useState("");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          router.replace(`/login?next=${encodeURIComponent("/account/setup")}`);
          return;
        }
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          router.replace(`/login?next=${encodeURIComponent("/account/setup")}`);
          return;
        }
        const { data: account, error: accountError } = await supabase
          .from("accounts")
          .select("account_id, user_name")
          .eq("auth_user_id", userData.user.id)
          .single();
        if (accountError) throw accountError;
        if (!active) return;
        if (!isGeneratedAccountId(account.account_id)) {
          router.replace(nextPath);
          return;
        }
        const githubIdentity = userData.user.identities?.find((identity) => identity.provider === "github");
        const githubIdentityData = githubIdentity?.identity_data ?? {};
        const githubUsername = typeof githubIdentityData.user_name === "string"
          ? githubIdentityData.user_name
          : typeof githubIdentityData.login === "string"
            ? githubIdentityData.login
            : "";
        const normalizedSuggestion = (suggestedId || githubUsername).trim().toLowerCase();
        setAccountId(
          isGeneratedAccountId(account.account_id)
            && /^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalizedSuggestion)
            ? normalizedSuggestion
            : account.account_id,
        );
        setUserName(isGeneratedAccountId(account.account_id) ? githubUsername || account.user_name : account.user_name);
      } catch (setupError) {
        if (active) {
          setError(setupError instanceof Error ? setupError.message : "Unable to load your account.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [nextPath, router, suggestedId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) throw new Error("Your session expired. Sign in again to continue.");

      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: {
          authorization: `Bearer ${sessionData.session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ accountId, userName }),
      });
      const result = await response.json() as { accountId?: string; userName?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to save your User ID.");
      if (result.accountId && result.userName) updateAuthenticatedClientProfile(result.accountId, result.userName);

      if (password) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) {
          setAccountId(result.accountId ?? accountId);
          throw new Error(`Account details saved, but the password could not be set: ${passwordError.message}`);
        }
      }
      router.replace(nextPath);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to complete account setup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="NoteBooks home">
          <span className="brand-mark">n</span><span>NoteBooks</span>
        </Link>
        <span className="eyebrow"><span className="eyebrow-line" /> FINISH YOUR ACCOUNT</span>
        <h1>Choose your User ID.</h1>
        <p className="auth-description">Your GitHub identity is linked. Choose a permanent User ID and display name, and optionally add a password for email sign-in.</p>
        {loading ? (
          <p className="auth-description" role="status">Loading your account…</p>
        ) : (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
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
            <label>
              Password <span className="auth-optional">(optional)</span>
              <input
                autoComplete="new-password"
                minLength={password ? 8 : undefined}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
              <small>Leave blank to continue using GitHub sign-in only.</small>
            </label>
            <button className="auth-submit" type="submit" disabled={busy || loading}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}
        {message && <p className="auth-feedback auth-success" role="status">{message}</p>}
        {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}

export function AccountSetup() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card">Loading account…</div></div>}>
      <AccountSetupContent />
    </Suspense>
  );
}
