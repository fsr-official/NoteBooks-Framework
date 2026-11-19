"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type TreeGroup = "lowersecondary" | "science" | "commerce" | "humanities" | "developer";

interface Repository {
  id: string;
  account_id: string | null;
  registry_name: string;
  repo_owner: string;
  repo_name: string;
  branch: string;
  class_or_stream: TreeGroup;
  root: string;
  enabled: boolean;
  empty: boolean;
  lfs: boolean;
  pages: boolean;
  fallback: string | null;
  priority: number | null;
  last_commit_sha: string | null;
  last_checked_at: string | null;
  last_updated_at: string | null;
  archived_at: string | null;
  file_count?: number;
  invalid_file_sha_count?: number;
}

interface RepositoryDraft {
  account_id: string;
  registry_name: string;
  repo_owner: string;
  repo_name: string;
  branch: string;
  class_or_stream: TreeGroup;
  root: string;
  enabled: boolean;
  empty: boolean;
  lfs: boolean;
  pages: boolean;
  fallback: string;
  priority: string;
}

interface DashboardSnapshot {
  summary: {
    totalRepositories: number;
    enabledRepositories: number;
    disabledRepositories: number;
    archivedRepositories: number;
    totalFiles: number;
    activeFiles: number;
    invalidFileShas: number;
    repositoriesWithoutCommit: number;
    staleRepositories: number;
    requests24h: number;
    errors24h: number;
    pageViews24h: number;
    averageDurationMs24h: number;
    maxDurationMs24h: number;
  };
  repositories: Repository[];
  accounts: Array<{ account_id: string; role: "admin" | "user" }>;
  apiMetrics24h: Array<{
    route: string;
    method: string;
    requests: number;
    errors: number;
    averageDurationMs: number;
    maxDurationMs: number;
  }>;
  pageTraffic24h: Array<{ route: string; views: number }>;
  recentEvents: Array<{
    id: number;
    created_at: string;
    account_id: string;
    action: string;
    resource: string;
    details: Record<string, string | number | boolean | null>;
  }>;
  recentSyncRuns: Array<{
    id: number;
    repo_owner: string;
    repo_name: string;
    branch: string;
    status: "running" | "updated" | "unchanged" | "ignored" | "failed";
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    commit_sha: string | null;
    file_count: number | null;
    error_code: string | null;
    requested_by: string | null;
  }>;
  services: {
    database: "healthy" | "unavailable";
    redis: "healthy" | "unavailable";
    github: "configured" | "missing";
    qstash: "configured" | "missing";
  };
  observedAt: string;
}

interface AdminStatus {
  isAdmin: boolean;
  hasAdministrator: boolean;
  bootstrapAvailable: boolean;
}

interface AiProviderKey {
  keySlot: string;
  configured: boolean;
  enabled: boolean;
  cooldownUntil: string | null;
  cooldownActive: boolean;
  lastRateLimitedAt: string | null;
  requests24h: number;
  promptTokens24h: number;
  completionTokens24h: number;
  rateLimited24h: number;
  requests30d: number;
  promptTokens30d: number;
  completionTokens30d: number;
}

interface ApiError extends Error {
  status?: number;
}

const GROUPS: Array<{ value: TreeGroup; label: string }> = [
  { value: "lowersecondary", label: "Lower Secondary" },
  { value: "science", label: "Science" },
  { value: "commerce", label: "Commerce" },
  { value: "humanities", label: "Humanities" },
  { value: "developer", label: "Developer" },
];

const EMPTY_DRAFT: RepositoryDraft = {
  account_id: "",
  registry_name: "",
  repo_owner: "",
  repo_name: "",
  branch: "main",
  class_or_stream: "science",
  root: "",
  enabled: true,
  empty: false,
  lfs: false,
  pages: false,
  fallback: "",
  priority: "",
};

function sessionToken(session: Session | null): string {
  if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
  return session.access_token;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Never checked";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function repositoryDraft(repository?: Repository): RepositoryDraft {
  if (!repository) return { ...EMPTY_DRAFT };
  return {
    account_id: repository.account_id ?? "",
    registry_name: repository.registry_name,
    repo_owner: repository.repo_owner,
    repo_name: repository.repo_name,
    branch: repository.branch,
    class_or_stream: repository.class_or_stream,
    root: repository.root ?? "",
    enabled: repository.enabled,
    empty: repository.empty,
    lfs: repository.lfs,
    pages: repository.pages,
    fallback: repository.fallback ?? "",
    priority: repository.priority === null ? "" : String(repository.priority),
  };
}

function healthLabel(value: string): string {
  return value.replaceAll("-", " ");
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

export function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [aiProviderKeys, setAiProviderKeys] = useState<AiProviderKey[]>([]);
  const [draft, setDraft] = useState<RepositoryDraft>({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const apiRequest = useCallback(async <T,>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> => {
    const activeSession = session ?? (await getSupabaseBrowserClient().auth.getSession()).data.session;
    const token = sessionToken(activeSession);
    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      const requestError: ApiError = new Error(payload?.error || `Request failed (${response.status})`);
      requestError.status = response.status;
      throw requestError;
    }
    return payload as T;
  }, [session]);

  const loadAdminData = useCallback(async (activeSession: Session) => {
    const token = sessionToken(activeSession);
    const statusResponse = await fetch("/api/admin/status", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const statusPayload = await statusResponse.json() as AdminStatus & { error?: string };
    if (!statusResponse.ok) throw new Error(statusPayload.error || "Unable to check administrator access.");
    setAdminStatus(statusPayload);
    if (!statusPayload.isAdmin) return;

    const [overview, repositoryResponse, providerKeyResponse] = await Promise.all([
      apiRequest<DashboardSnapshot>("/api/admin/overview", { cache: "no-store" }),
      apiRequest<{ repositories: Repository[] }>("/api/admin/repositories", { cache: "no-store" }),
      apiRequest<{ keys: AiProviderKey[] }>("/api/admin/ai-provider-keys", { cache: "no-store" }),
    ]);
    setSnapshot(overview);
    setRepositories(repositoryResponse.repositories);
    setAiProviderKeys(providerKeyResponse.keys);
  }, [apiRequest]);

  const refresh = useCallback(async () => {
    const activeSession = (await getSupabaseBrowserClient().auth.getSession()).data.session;
    if (!activeSession) throw new Error("Sign in to continue.");
    setSession(activeSession);
    await loadAdminData(activeSession);
  }, [loadAdminData]);

  useEffect(() => {
    let active = true;
    void getSupabaseBrowserClient().auth.getSession()
      .then(async ({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        if (!active) return;
        setSession(data.session);
        if (data.session) await loadAdminData(data.session);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load admin dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadAdminData]);

  async function submitBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/admin/bootstrap", {
        method: "POST",
        body: JSON.stringify({ token: bootstrapToken }),
      });
      setBootstrapToken("");
      setMessage("Administrator access is enabled. Remove ADMIN_BOOTSTRAP_TOKEN from the deployment environment now.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create the administrator.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const body = {
      ...draft,
      account_id: draft.account_id.trim() || null,
      fallback: draft.fallback.trim() || null,
      priority: draft.priority.trim() ? Number(draft.priority) : null,
    };
    try {
      await apiRequest(
        editingId ? `/api/admin/repositories/${editingId}` : "/api/admin/repositories",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      setMessage(editingId ? "Repository configuration updated." : "Repository added to the catalog.");
      setEditingId(null);
      setDraft({ ...EMPTY_DRAFT });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save repository.");
    } finally {
      setBusy(false);
    }
  }

  async function requestRepositoryCheck(repoId?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ queued: number; failed: string[]; status: string }>(
        "/api/admin/repositories/sync",
        { method: "POST", body: JSON.stringify(repoId ? { repoId } : {}) },
      );
      setMessage(`${result.queued} repository check${result.queued === 1 ? "" : "s"} queued. Results will appear after the worker finishes.`);
      if (result.failed.length) setError(`Could not queue: ${result.failed.join(", ")}`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to queue repository checks.");
    } finally {
      setBusy(false);
    }
  }

  async function rebuildIndexes() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/admin/indexes/rebuild", { method: "POST", body: "{}" });
      setMessage("All public library indexes were rebuilt.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to rebuild public indexes.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveRepository(repository: Repository) {
    if (!window.confirm(`Archive ${repository.repo_owner}/${repository.repo_name}? It will be removed from public indexes but its records will be retained.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/admin/repositories/${repository.id}`, { method: "DELETE" });
      setMessage(`${repository.repo_owner}/${repository.repo_name} was archived.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to archive repository.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreRepository(repository: Repository) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/admin/repositories/${repository.id}`, { method: "POST", body: "{}" });
      setMessage(`${repository.repo_owner}/${repository.repo_name} was restored.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to restore repository.");
    } finally {
      setBusy(false);
    }
  }

  async function setAiProviderKeyEnabled(key: AiProviderKey, enabled: boolean) {
    if (!key.configured) return;
    if (!enabled && !window.confirm(`Disable the ${key.keySlot} Groq key slot? It will no longer receive new requests.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/admin/ai-provider-keys/${key.keySlot}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setMessage(`${key.keySlot} Groq key slot ${enabled ? "enabled" : "disabled"}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update AI provider key status.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut();
    if (signOutError) setError(signOutError.message);
    else {
      setSession(null);
      setAdminStatus(null);
      setSnapshot(null);
      setRepositories([]);
      setAiProviderKeys([]);
    }
  }

  function updateDraft<Key extends keyof RepositoryDraft>(key: Key, value: RepositoryDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  if (loading) {
    return <main className="admin-page"><p className="admin-loading">Loading administration console…</p></main>;
  }

  if (!session) {
    return (
      <main className="admin-page">
        <section className="admin-gate">
          <span className="admin-eyebrow">NOTEBOOKS OPERATIONS</span>
          <h1>Sign in to continue.</h1>
          <p>Administrator access is restricted to the designated NoteBooks account.</p>
          <Link className="admin-primary-button" href="/login?next=%2Fadmin">Sign in</Link>
          <Link className="admin-register-link" href="/register?next=%2Fadmin">Need an account? Register</Link>
          {error && <p className="admin-error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (!adminStatus?.isAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-gate">
          <span className="admin-eyebrow">INITIAL ADMINISTRATOR SETUP</span>
          {adminStatus?.hasAdministrator
            ? <>
              <h1>Administrator access required.</h1>
              <p>This account does not have permission to manage the repository catalog.</p>
              <button className="admin-secondary-button" type="button" onClick={() => void signOut()}>Sign out</button>
            </>
            : <>
              <h1>Claim the administrator account.</h1>
              <p>Create or sign in to the account you want to make the single NoteBooks administrator. Enter the one-time bootstrap token configured on the server.</p>
              {adminStatus?.bootstrapAvailable
                ? <form className="admin-bootstrap-form" onSubmit={(event) => void submitBootstrap(event)}>
                  <label htmlFor="admin-bootstrap-token">One-time bootstrap token</label>
                  <input
                    autoComplete="off"
                    id="admin-bootstrap-token"
                    onChange={(event) => setBootstrapToken(event.target.value)}
                    required
                    type="password"
                    value={bootstrapToken}
                  />
                  <button className="admin-primary-button" disabled={busy} type="submit">
                    {busy ? "Setting up…" : "Create administrator"}
                  </button>
                </form>
                : <p className="admin-warning">No administrator exists, but bootstrap is not configured. Set ADMIN_BOOTSTRAP_TOKEN on the server, then reload this page.</p>}
            </>}
          {message && <p className="admin-success" role="status">{message}</p>}
          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="admin-gate-footer">
            <Link href="/">← Back to NoteBooks</Link>
            <button type="button" onClick={() => void signOut()}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  const summary = snapshot?.summary;
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">NOTEBOOKS OPERATIONS CONSOLE</span>
          <h1>Good to have you back.</h1>
          <p>Repository catalog, service health, and recent application activity.</p>
        </div>
        <div className="admin-header-actions">
          <button className="admin-secondary-button" disabled={busy} onClick={() => void refresh()} type="button">Refresh data</button>
          <Link className="admin-secondary-button" href="/">View library</Link>
          <button className="admin-secondary-button" onClick={() => void signOut()} type="button">Sign out</button>
        </div>
      </header>

      {message && <p className="admin-success admin-notice" role="status">{message}</p>}
      {error && <p className="admin-error admin-notice" role="alert">{error}</p>}

      <section aria-label="Key metrics" className="admin-metric-grid">
        <Metric label="Active repositories" value={summary?.enabledRepositories} detail={`${summary?.totalRepositories ?? 0} total, ${summary?.archivedRepositories ?? 0} archived`} />
        <Metric label="Catalogued files" value={summary?.activeFiles} detail={`${summary?.invalidFileShas ?? 0} invalid SHA records`} />
        <Metric label="API requests · 24h" value={summary?.requests24h} detail={`${summary?.errors24h ?? 0} server errors`} />
        <Metric label="Library page views · 24h" value={summary?.pageViews24h} detail="Aggregated by page and minute; no visitor IDs" />
        <Metric label="Average API time" value={summary ? `${summary.averageDurationMs24h} ms` : undefined} detail={`Peak ${summary?.maxDurationMs24h ?? 0} ms over 24 hours`} />
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><span className="admin-eyebrow">SYSTEM STATUS</span><h2>Service health</h2></div>
          <span className="admin-updated">Checked {formatDate(snapshot?.observedAt)}</span>
        </div>
        <div className="admin-health-grid">
          {Object.entries(snapshot?.services ?? {}).map(([service, status]) => (
            <div className="admin-health-card" key={service}>
              <span className={`admin-health-dot ${status === "healthy" || status === "configured" ? "is-healthy" : "is-unavailable"}`} />
              <span><strong>{service}</strong><small>{healthLabel(status)}</small></span>
            </div>
          ))}
        </div>
        <div className="admin-health-notes">
          <span>{summary?.staleRepositories ?? 0} repositories not checked in the last 7 days</span>
          <span>{summary?.repositoriesWithoutCommit ?? 0} enabled repositories missing a commit SHA</span>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><span className="admin-eyebrow">AI OPERATIONS</span><h2>Groq provider keys</h2></div>
          <span className="admin-updated">Usage is aggregated; secret values are never displayed</span>
        </div>
        <div className="admin-ai-key-list">
          {aiProviderKeys.map((key) => {
            return (
              <article className="admin-ai-key-card" key={key.keySlot}>
                <div className="admin-ai-key-heading">
                  <div>
                    <h3>{key.keySlot}</h3>
                    <span className={`admin-pill ${key.enabled ? "is-enabled" : "is-disabled"}`}>{key.enabled ? "Enabled" : "Disabled"}</span>
                    <span className={`admin-pill ${key.configured ? "is-enabled" : "is-disabled"}`}>{key.configured ? "Configured" : "Missing secret"}</span>
                    {key.cooldownActive && <span className="admin-pill is-running">Rate limited until {formatDate(key.cooldownUntil)}</span>}
                  </div>
                  <button
                    className={key.enabled ? "admin-danger-button" : "admin-secondary-button"}
                    disabled={busy || !key.configured}
                    onClick={() => void setAiProviderKeyEnabled(key, !key.enabled)}
                    type="button"
                  >
                    {key.enabled ? "Disable key" : "Enable key"}
                  </button>
                </div>
                <div className="admin-ai-key-metrics">
                  <span><strong>{formatCount(key.requests24h)}</strong> requests · 24h</span>
                  <span><strong>{formatCount(key.promptTokens24h + key.completionTokens24h)}</strong> tokens · 24h</span>
                  <span><strong>{formatCount(key.rateLimited24h)}</strong> rate limits · 24h</span>
                  <span><strong>{formatCount(key.requests30d)}</strong> requests · 30d</span>
                  <span><strong>{formatCount(key.promptTokens30d + key.completionTokens30d)}</strong> tokens · 30d</span>
                  <span>Last rate limit: {formatDate(key.lastRateLimitedAt)}</span>
                </div>
              </article>
            );
          })}
          {aiProviderKeys.length === 0 && <p className="admin-empty">No AI provider key status is available.</p>}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><span className="admin-eyebrow">CATALOG CONTROL</span><h2>Repositories</h2></div>
          <div className="admin-toolbar">
            <button className="admin-secondary-button" disabled={busy} onClick={() => void rebuildIndexes()} type="button">Rebuild indexes</button>
            <button className="admin-primary-button" disabled={busy} onClick={() => void requestRepositoryCheck()} type="button">Check all repositories</button>
          </div>
        </div>

        <form className="admin-repository-form" onSubmit={(event) => void saveRepository(event)}>
          <div className="admin-form-heading">
            <div><h3>{editingId ? "Edit repository" : "Add a repository"}</h3><p>Metadata is stored in Supabase; repository checks are queued and processed asynchronously.</p></div>
            {editingId && <button className="admin-text-button" onClick={() => { setEditingId(null); setDraft({ ...EMPTY_DRAFT }); }} type="button">Cancel edit</button>}
          </div>
          <div className="admin-form-grid">
            <label>Display name<input onChange={(event) => updateDraft("registry_name", event.target.value)} required value={draft.registry_name} /></label>
            <label>GitHub owner<input onChange={(event) => updateDraft("repo_owner", event.target.value)} required value={draft.repo_owner} /></label>
            <label>Repository name<input onChange={(event) => updateDraft("repo_name", event.target.value)} required value={draft.repo_name} /></label>
            <label>Branch<input onChange={(event) => updateDraft("branch", event.target.value)} required value={draft.branch} /></label>
            <label>Library<select onChange={(event) => updateDraft("class_or_stream", event.target.value as TreeGroup)} value={draft.class_or_stream}>
              {GROUPS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
            </select></label>
            <label>Responsible account<select onChange={(event) => updateDraft("account_id", event.target.value)} value={draft.account_id}>
              <option value="">Unassigned</option>
              {(snapshot?.accounts ?? []).map((account) => (
                <option key={account.account_id} value={account.account_id}>{account.account_id} · {account.role}</option>
              ))}
            </select></label>
            <label>Root path (optional)<input onChange={(event) => updateDraft("root", event.target.value)} placeholder="e.g. notes" value={draft.root} /></label>
            <label>Fallback (optional)<input onChange={(event) => updateDraft("fallback", event.target.value)} value={draft.fallback} /></label>
            <label>Priority (optional)<input min="0" onChange={(event) => updateDraft("priority", event.target.value)} type="number" value={draft.priority} /></label>
          </div>
          <div className="admin-checkbox-row">
            <label><input checked={draft.enabled} onChange={(event) => updateDraft("enabled", event.target.checked)} type="checkbox" /> Enabled</label>
            <label><input checked={draft.empty} onChange={(event) => updateDraft("empty", event.target.checked)} type="checkbox" /> Empty library</label>
            <label><input checked={draft.lfs} onChange={(event) => updateDraft("lfs", event.target.checked)} type="checkbox" /> Git LFS</label>
            <label><input checked={draft.pages} onChange={(event) => updateDraft("pages", event.target.checked)} type="checkbox" /> GitHub Pages</label>
          </div>
          <button className="admin-primary-button" disabled={busy} type="submit">{busy ? "Saving…" : editingId ? "Save repository" : "Add repository"}</button>
        </form>

        <div className="admin-repository-list">
          {repositories.length === 0 && <p className="admin-empty">No repository records are available.</p>}
          {repositories.map((repository) => (
            <article className={`admin-repository-card ${repository.archived_at ? "is-archived" : ""}`} key={repository.id}>
              <div className="admin-repository-main">
                <div>
                  <div className="admin-repository-title">
                    <h3>{repository.registry_name}</h3>
                    <span className={`admin-pill ${repository.archived_at ? "is-archived" : repository.enabled ? "is-enabled" : "is-disabled"}`}>
                      {repository.archived_at ? "Archived" : repository.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <a className="admin-repo-url" href={`https://github.com/${repository.repo_owner}/${repository.repo_name}`} rel="noreferrer" target="_blank">
                    {repository.repo_owner}/{repository.repo_name} ↗
                  </a>
                  <p>{repository.class_or_stream} · <code>{repository.branch}</code> · {repository.file_count ?? 0} files</p>
                  <small>Responsible account: {repository.account_id || "Unassigned"}</small>
                  <small>Last checked: {formatDate(repository.last_checked_at)} · catalog updated: {formatDate(repository.last_updated_at)}</small>
                  <small>Latest commit: <code>{repository.last_commit_sha?.slice(0, 8) ?? "not recorded"}</code></small>
                  {(repository.invalid_file_sha_count ?? 0) > 0 && <small className="admin-inline-warning">{repository.invalid_file_sha_count} invalid file SHA records</small>}
                </div>
                <div className="admin-repository-actions">
                  {repository.archived_at
                    ? <button className="admin-secondary-button" disabled={busy} onClick={() => void restoreRepository(repository)} type="button">Restore</button>
                    : <>
                    <button className="admin-secondary-button" disabled={busy || !repository.enabled} onClick={() => void requestRepositoryCheck(repository.id)} type="button">Check now</button>
                    <button className="admin-secondary-button" disabled={busy} onClick={() => { setEditingId(repository.id); setDraft(repositoryDraft(repository)); window.scrollTo({ top: 0, behavior: "smooth" }); }} type="button">Edit</button>
                    <button className="admin-danger-button" disabled={busy} onClick={() => void archiveRepository(repository)} type="button">Archive</button>
                  </>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><span className="admin-eyebrow">TRAFFIC & RELIABILITY</span><h2>API health · last 24 hours</h2></div>
          <span className="admin-updated">Metrics are collected in one-minute buckets</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Requests</th><th>5xx errors</th><th>Avg ms</th><th>Peak ms</th></tr></thead>
            <tbody>
              {(snapshot?.apiMetrics24h ?? []).map((metric) => (
                <tr key={`${metric.route}-${metric.method}`}>
                  <td><code>{metric.route}</code></td><td>{metric.method}</td><td>{metric.requests}</td>
                  <td className={metric.errors ? "admin-error-text" : ""}>{metric.errors}</td>
                  <td>{metric.averageDurationMs}</td><td>{metric.maxDurationMs}</td>
                </tr>
              ))}
              {!snapshot?.apiMetrics24h.length && <tr><td className="admin-empty" colSpan={6}>No API traffic has been recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="admin-page-traffic" aria-label="Page views in the last 24 hours">
          {(snapshot?.pageTraffic24h ?? []).map((page) => (
            <div className="admin-page-traffic-row" key={page.route}>
              <code>{page.route}</code><span>{page.views} views</span>
            </div>
          ))}
          {!snapshot?.pageTraffic24h.length && <span className="admin-empty">No page views recorded yet.</span>}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><span className="admin-eyebrow">AUDIT TRAIL</span><h2>Recent administrative activity</h2></div>
        </div>
        <div className="admin-event-list">
          {(snapshot?.recentEvents ?? []).map((event) => (
            <article className="admin-event" key={event.id}>
              <time>{formatDate(event.created_at)}</time>
              <strong>{event.action}</strong>
              <span>{event.resource}</span>
              <small>Account {event.account_id}{Object.keys(event.details ?? {}).length ? ` · ${JSON.stringify(event.details)}` : ""}</small>
            </article>
          ))}
          {!snapshot?.recentEvents.length && <p className="admin-empty">No administrative actions recorded yet.</p>}
        </div>
        <div className="admin-section-heading admin-sync-heading">
          <div><span className="admin-eyebrow">REPOSITORY OPERATIONS</span><h2>Recent repository checks</h2></div>
          <span className="admin-updated">Includes webhook and manual checks</span>
        </div>
        <div className="admin-sync-list">
          {(snapshot?.recentSyncRuns ?? []).map((run) => (
            <article className="admin-sync-row" key={run.id}>
              <span className={`admin-pill ${run.status === "failed" ? "is-failed" : run.status === "running" ? "is-running" : "is-enabled"}`}>
                {run.status}
              </span>
              <strong>{run.repo_owner}/{run.repo_name}</strong>
              <span><code>{run.branch}</code></span>
              <span>{formatDate(run.started_at)}</span>
              <span>{run.duration_ms === null ? "In progress" : `${run.duration_ms} ms`}</span>
              <small>
                {run.status === "failed"
                  ? `Failure code: ${run.error_code ?? "sync_failed"}`
                  : run.status === "ignored"
                    ? "Repository is disabled, archived, or branch no longer matches."
                    : `${run.file_count ?? 0} files${run.commit_sha ? ` · ${run.commit_sha.slice(0, 8)}` : ""}`}
                {run.requested_by ? ` · requested by ${run.requested_by}` : ""}
              </small>
            </article>
          ))}
          {!snapshot?.recentSyncRuns.length && <p className="admin-empty">No repository check runs recorded yet.</p>}
        </div>
        <p className="admin-log-note">
          Detailed runtime and deployment logs are managed by Vercel and are not copied into this application.
          <a href="https://vercel.com/dashboard" rel="noreferrer" target="_blank"> Open the Vercel dashboard ↗</a>
        </p>
      </section>
      <footer className="admin-footer">Private operations console · data refreshed {formatDate(snapshot?.observedAt)}</footer>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number | undefined; detail: string }) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <small>{detail}</small>
    </article>
  );
}
