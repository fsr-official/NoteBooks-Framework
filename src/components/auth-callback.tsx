"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { bindAuthenticatedClientSession } from "@/lib/client-session";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackStarted = useRef(false);
  const [error, setError] = useState("");
  const providerError = searchParams.get("error_description") || searchParams.get("error");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (providerError || callbackStarted.current) return;
    callbackStarted.current = true;

    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash && (type === "signup" || type === "email" || type === "email_change" || type === "recovery")) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (verifyError) throw verifyError;
        } else {
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (!data.session) throw new Error("This sign-in link is invalid or has expired.");
        }
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) throw new Error("Supabase completed the callback without creating a browser session.");
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) throw new Error("Unable to verify the signed-in account.");
        const boundAccount = await bindAuthenticatedClientSession(sessionData.session.access_token);
        if (boundAccount.needsSetup) {
          const setupParams = new URLSearchParams({ next: nextPath });
          if (boundAccount.githubUsername) setupParams.set("suggested", boundAccount.githubUsername);
          router.replace(`/account/setup?${setupParams.toString()}`);
          return;
        }
        const linked = nextPath.startsWith("/account") && searchParams.get("next")?.includes("linked=github");
        router.replace(linked ? "/account/settings?linked=github" : nextPath);
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : "Unable to complete sign-in.");
      }
    })();
  }, [code, nextPath, providerError, router, searchParams, tokenHash, type]);
  const displayError = error || providerError || "";

  return (
    <main className="auth-page">
      <section className="auth-card auth-callback-card">
        <Link className="brand auth-brand" href="/"><span className="brand-mark">n</span><span>NoteBooks</span></Link>
        {displayError ? (
          <>
            <h1>We couldn’t complete sign-in.</h1>
            <p className="auth-feedback auth-error" role="alert">{displayError}</p>
            <Link className="auth-submit" href="/login">Return to sign in</Link>
          </>
        ) : (
          <>
            <span className="loading-spinner" />
            <h1>Finishing sign-in…</h1>
            <p className="auth-description">You’ll be redirected when your account is ready.</p>
          </>
        )}
      </section>
    </main>
  );
}

export function AuthCallback() {
  return <Suspense fallback={<div className="auth-page"><div className="auth-card">Finishing sign-in…</div></div>}><CallbackContent /></Suspense>;
}
