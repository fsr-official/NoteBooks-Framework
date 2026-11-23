import "server-only";

import { enqueueRepositoryUpdate } from "@/lib/qstash";
import {
  createAdminRepositoryUpdateIdentity,
  type RepositoryUpdateIdentity,
} from "@/lib/repository-update-identity";

export interface RepositoryToQueue {
  branch: string;
  repo_name: string;
  repo_owner: string;
}

export interface RepositoryQueueResult {
  repository: string;
  status: "queued" | "failed";
  messageId?: string;
}

export async function queueRepositoryUpdates(
  repositories: RepositoryToQueue[],
  requestedBy?: string,
  identity: RepositoryUpdateIdentity = createAdminRepositoryUpdateIdentity(),
): Promise<RepositoryQueueResult[]> {
  const results: RepositoryQueueResult[] = new Array(repositories.length);
  let nextIndex = 0;

  async function enqueueNext(): Promise<void> {
    while (nextIndex < repositories.length) {
      const index = nextIndex++;
      const repository = repositories[index];
      const name = `${repository.repo_owner}/${repository.repo_name}`;
      try {
        const messageId = await enqueueRepositoryUpdate({
          repository: name,
          branch: repository.branch,
          identity,
          ...(requestedBy ? { requestedBy } : {}),
        });
        results[index] = { repository: name, status: "queued", messageId };
      } catch (error) {
        console.error(`Unable to queue repository check for ${name}`, error);
        results[index] = { repository: name, status: "failed" };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(4, repositories.length) }, () => enqueueNext()),
  );
  return results;
}
