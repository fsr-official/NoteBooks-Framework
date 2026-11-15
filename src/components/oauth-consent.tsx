"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const SCOPE_LABELS: Record<string, string> = {
  email: "View your email address",
  openid: "Verify your identity",
  phone: "View your phone number",
  profile: "View your basic profile",
};

function ConsentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authorizationId = searchParams.get("authorization_id");
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let redirecting = false;
    void Promise.resolve()
      .then(async () => {
        if (!authorizationId) throw new Error("The authorization request is missing its ID.");
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          const next = `/oauth/consent?${new URLSearchParams({ authorization_id: authorizationId })}`;
          redirecting = true;
          router.replace(`/login?${new URLSearchParams({ next })}`);
          return;
        }
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          const next = `/oauth/consent?${new URLSearchParams({ authorization_id: authorizationId })}`;
          redirecting = true;
          router.replace(`/login?${new URLSearchParams({ next })}`);
          return;
        }

        const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (detailsError) throw detailsError;
        if (!data) throw new Error("Supabase returned no authorization details.");
        if ("redirect_url" in data) {
          redirecting = true;
          window.location.assign(data.redirect_url);
          return;
        }
        if (active) setDetails(data);
      })
      .catch((authError: unknown) => {
        if (active) setError(authError instanceof Error ? authError.message : "Unable to load the authorization request.");
      })
      .finally(() => {
        if (active && !redirecting) setLoading(false);
      });
    return () => { active = false; };
  }, [authorizationId, router]);

  async function decide(approved: boolean) {
    if (!authorizationId) return;
    setBusy(true);
    setError("");
    try {
      const oauth = getSupabaseBrowserClient().auth.oauth;
      const { data, error: decisionError } = approved
        ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (decisionError) throw decisionError;
      if (!data?.redirect_url) throw new Error("Supabase did not return the OAuth client redirect.");
      window.location.assign(data.redirect_url);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to submit your consent decision.");
      setBusy(false);
    }
  }

  const scopes = details?.scope.split(/\s+/).filter(Boolean) ?? [];
  const redirectHost = details ? (() => {
    try {
      return new URL(details.redirect_uri).host;
    } catch {
      return details.redirect_uri;
    }
  })() : "";

  return (
    <main className="auth-page">
      <section className="auth-card oauth-consent-card">
        <Link className="brand auth-brand" href="/" aria-label="NoteBooks home">
          <span className="brand-mark">n</span><span>NoteBooks</span>
        </Link>
        <span className="eyebrow"><span className="eyebrow-line" /> AUTHORIZATION REQUEST</span>
        {loading ? (
          <div className="oauth-consent-loading"><span className="loading-spinner" /><p>Checking this authorization request…</p></div>
        ) : details ? (
          <>
            <h1>Allow {details.client.name} to connect?</h1>
            <p className="auth-description">
              This application is requesting access to your NoteBooks account. Review the requested information before continuing.
            </p>
            <div className="oauth-client-card">
              <span className="oauth-client-logo oauth-client-placeholder">{details.client.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{details.client.name}</strong><small>{details.client.uri || redirectHost}</small></span>
            </div>
            <div className="oauth-consent-section">
              <span>YOU’RE SIGNED IN AS</span>
              <strong>{details.user.email}</strong>
            </div>
            <div className="oauth-consent-section">
              <span>THIS APP WILL BE ABLE TO</span>
              {scopes.length > 0 ? (
                <ul>{scopes.map((scope) => <li key={scope}>{SCOPE_LABELS[scope] ?? `Access the “${scope}” permission`}</li>)}</ul>
              ) : <p>No additional profile permissions were requested.</p>}
            </div>
            <p className="oauth-redirect-note">After approval, you’ll return to <code>{redirectHost}</code>.</p>
            {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
            <div className="oauth-consent-actions">
              <button type="button" className="auth-submit" disabled={busy} onClick={() => void decide(true)}>{busy ? "Please wait…" : "Approve access"}</button>
              <button type="button" className="auth-secondary" disabled={busy} onClick={() => void decide(false)}>Deny</button>
            </div>
            <p className="oauth-consent-footnote">Only approve if you trust this application. You can revoke access later.</p>
          </>
        ) : (
          <>
            <h1>Unable to authorize this app.</h1>
            <p className="auth-feedback auth-error" role="alert">{error || "This authorization request is invalid or expired."}</p>
            <Link className="auth-secondary oauth-back-link" href="/">Back to NoteBooks</Link>
          </>
        )}
      </section>
    </main>
  );
}

export function OAuthConsent() {
  return <Suspense fallback={<div className="auth-page"><div className="auth-card">Loading authorization…</div></div>}><ConsentContent /></Suspense>;
}
