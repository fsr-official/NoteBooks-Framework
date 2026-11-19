import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdmin,
  recordAdminAuditEvent,
  rebuildAdminRepositoryIndexes,
  createSupabaseAdminClient,
  from,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  recordAdminAuditEvent: vi.fn(),
  rebuildAdminRepositoryIndexes: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/admin-access", () => ({ requireAdmin }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAuditEvent }));
vi.mock("@/lib/admin-repository-index", () => ({ rebuildAdminRepositoryIndexes }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST as createRepository } from "../src/app/api/admin/repositories/route";
import {
  DELETE as archiveRepository,
  POST as restoreRepository,
  PATCH as updateRepository,
} from "../src/app/api/admin/repositories/[id]/route";

const administrator = {
  accountId: "admin-01",
  role: "admin" as const,
  user: { id: "auth-admin" },
};

const repositoryId = "11111111-1111-4111-8111-111111111111";
const repositoryFields = {
  account_id: "student-01",
  branch: "main",
  class_or_stream: "science",
  empty: false,
  enabled: true,
  fallback: null,
  lfs: false,
  pages: false,
  priority: 1,
  registry_name: "Science Notes",
  repo_name: "notes",
  repo_owner: "owner",
  root: "",
};

function request(path: string, method: string, body?: unknown) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { authorization: "Bearer token" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function configureQuery(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const query = {
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    not: vi.fn(() => query),
    single: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
    maybeSingle: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
  };
  from.mockReturnValue(query);
  createSupabaseAdminClient.mockReturnValue({ from });
  return query;
}

describe("admin repository mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ account: administrator, response: null });
    recordAdminAuditEvent.mockResolvedValue(undefined);
    rebuildAdminRepositoryIndexes.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a repository record and refreshes indexes", async () => {
    const stored = { id: repositoryId, ...repositoryFields };
    const query = configureQuery({ data: stored });
    const response = await createRepository(
      request("/api/admin/repositories", "POST", repositoryFields),
    );

    expect(response.status).toBe(201);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      ...repositoryFields,
      record_type: "repository",
      archived_at: null,
      last_commit_sha: null,
    }));
    expect(recordAdminAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: administrator.accountId,
      action: "repository.create",
      resource: "owner/notes",
    }));
    expect(rebuildAdminRepositoryIndexes).toHaveBeenCalledOnce();
  });

  it("validates repository payloads and blocks non-admin users", async () => {
    const invalid = await createRepository(
      request("/api/admin/repositories", "POST", { ...repositoryFields, root: "../outside" }),
    );
    expect(invalid.status).toBe(400);

    requireAdmin.mockResolvedValue({
      account: null,
      response: Response.json({ error: "Administrator access is required" }, { status: 403 }),
    });
    expect((await createRepository(
      request("/api/admin/repositories", "POST", repositoryFields),
    )).status).toBe(403);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("updates whitelisted fields and archives without deleting catalog rows", async () => {
    const updated = { id: repositoryId, repo_owner: "owner", repo_name: "notes" };
    const patchQuery = configureQuery({ data: updated });
    const patched = await updateRepository(
      request(`/api/admin/repositories/${repositoryId}`, "PATCH", { enabled: false }),
      { params: Promise.resolve({ id: repositoryId }) },
    );
    expect(patched.status).toBe(200);
    expect(patchQuery.update).toHaveBeenCalledWith({ enabled: false });

    const archivedQuery = configureQuery({ data: updated });
    const archived = await archiveRepository(
      request(`/api/admin/repositories/${repositoryId}`, "DELETE"),
      { params: Promise.resolve({ id: repositoryId }) },
    );
    expect(archived.status).toBe(200);
    expect(archivedQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      archived_at: expect.any(String),
    }));

    const restoredQuery = configureQuery({ data: updated });
    const restored = await restoreRepository(
      request(`/api/admin/repositories/${repositoryId}`, "POST", {}),
      { params: Promise.resolve({ id: repositoryId }) },
    );
    expect(restored.status).toBe(200);
    expect(restoredQuery.update).toHaveBeenCalledWith({ archived_at: null });
  });
});
