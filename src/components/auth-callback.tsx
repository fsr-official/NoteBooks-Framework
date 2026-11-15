"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const providerError = searchParams.get("error_description") || searchParams.get("error");
    if (providerError) return;

    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash && (type === "signup" || type === "email")) {
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
        const nextPath = safeNextPath(searchParams.get("next"));
        const linked = nextPath.startsWith("/account") && searchParams.get("next")?.includes("linked=github");
        router.replace(linked ? "/account?linked=github" : nextPath);
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : "Unable to complete sign-in.");
      }
    })();
  }, [router, searchParams]);
  const providerError = searchParams.get("error_description") || searchParams.get("error");
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
