import { createHash } from "node:crypto";

export const REPOSITORY_UPDATE_QUEUE_SHARD_COUNT = 4;

export function repositoryUpdateQueueName(repository: string): string {
  const digest = createHash("sha256")
    .update(repository.trim().toLowerCase())
    .digest();
  const shard = digest.readUInt32BE(0) % REPOSITORY_UPDATE_QUEUE_SHARD_COUNT;
  return `repo-update-shard-${shard}`;
}
