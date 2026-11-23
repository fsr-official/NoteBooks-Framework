import { createHash, randomUUID } from "node:crypto";

export type RepositoryUpdateIdentity =
  | {
      source: "push" | "reconciliation";
      runId: string;
      runAttempt: number;
    }
  | {
      source: "admin";
      requestId: string;
    };

export interface RepositoryUpdateJob {
  repository: string;
  branch: string;
  identity: RepositoryUpdateIdentity;
  requestedBy?: string;
}

const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const WORKFLOW_RUN_ID_PATTERN = /^\d{1,20}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function isRepositoryUpdateIdentity(value: unknown): value is RepositoryUpdateIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Record<string, unknown>;

  if (identity.source === "push" || identity.source === "reconciliation") {
    return typeof identity.runId === "string"
      && WORKFLOW_RUN_ID_PATTERN.test(identity.runId)
      && typeof identity.runAttempt === "number"
      && Number.isSafeInteger(identity.runAttempt)
      && identity.runAttempt > 0
      && identity.runAttempt <= 1_000_000;
  }

  return identity.source === "admin"
    && typeof identity.requestId === "string"
    && UUID_PATTERN.test(identity.requestId);
}

export function isRepositoryUpdateJob(value: unknown): value is RepositoryUpdateJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;

  return typeof job.repository === "string"
    && REPOSITORY_PATTERN.test(job.repository)
    && job.repository.length <= 200
    && typeof job.branch === "string"
    && job.branch.trim().length > 0
    && job.branch.length <= 200
    && isRepositoryUpdateIdentity(job.identity)
    && (job.requestedBy === undefined
      || (typeof job.requestedBy === "string" && /^[a-z0-9][a-z0-9_-]{2,31}$/.test(job.requestedBy)));
}

export function createAdminRepositoryUpdateIdentity(): RepositoryUpdateIdentity {
  return { source: "admin", requestId: randomUUID() };
}

export function repositoryUpdateDeduplicationId(job: RepositoryUpdateJob): string {
  const identity = job.identity.source === "admin"
    ? ["admin", job.identity.requestId]
    : [job.identity.source, job.identity.runId, job.identity.runAttempt];
  const digest = createHash("sha256")
    .update(JSON.stringify([
      job.repository.toLowerCase(),
      job.branch,
      ...identity,
    ]))
    .digest("hex");

  // QStash rejects spaces and colons in deduplication IDs. This fixed-size
  // digest is bounded and scopes the key to one repository/branch occurrence.
  return `repo-update-${digest}`;
}
