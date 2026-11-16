import "server-only";

import { createHash } from "node:crypto";
import { Client, Receiver } from "@upstash/qstash";

export const REPOSITORY_UPDATE_WORKER_PATH = "/api/workflows/repository-update";

export interface RepositoryUpdateJob {
  repository: string;
  branch: string;
  requestedBy?: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured on the server`);
  return value;
}

function publicWorkerUrl(): string {
  const site = new URL(requiredEnv("APP_BASE_URL"));
  if (
    site.username
    || site.password
    || site.pathname !== "/"
    || site.search
    || site.hash
  ) {
    throw new Error("APP_BASE_URL must be an origin without credentials, path, query, or fragment");
  }
  if (site.protocol !== "https:" && site.hostname !== "localhost" && site.hostname !== "127.0.0.1") {
    throw new Error("APP_BASE_URL must use HTTPS outside local development");
  }
  return new URL(REPOSITORY_UPDATE_WORKER_PATH, site.origin).toString();
}

function repositoryQueueName(repository: string): string {
  const digest = createHash("sha256").update(repository.toLowerCase()).digest("hex").slice(0, 32);
  return `repo-update-${digest}`;
}

export function createQstashClient(): Client {
  const token = requiredEnv("QSTASH_TOKEN");
  return new Client({
    token,
    baseUrl: process.env.QSTASH_URL?.trim() || undefined,
    enableTelemetry: false,
  });
}

export async function enqueueRepositoryUpdate(job: RepositoryUpdateJob): Promise<string> {
  const response = await createQstashClient()
    .queue({ queueName: repositoryQueueName(job.repository) })
    .enqueueJSON({
      url: publicWorkerUrl(),
      body: job,
      retries: 5,
    });
  return response.messageId;
}

export async function verifyQstashRequest(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const receiver = new Receiver({
    currentSigningKey: requiredEnv("QSTASH_CURRENT_SIGNING_KEY"),
    nextSigningKey: requiredEnv("QSTASH_NEXT_SIGNING_KEY"),
    devMode: false,
  });
  return receiver.verify({
    signature,
    body,
    url: publicWorkerUrl(),
  });
}
