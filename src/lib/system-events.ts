import { isConfigured as isDbConfigured, query as dbQuery } from './db.js';

export type SystemEventType =
  | 'repository_added'
  | 'repository_removed'
  | 'file_added'
  | 'file_updated'
  | 'file_removed'
  | 'folder_added'
  | 'folder_removed'
  | 'issue_added'
  | 'issue_updated'
  | 'community_post_published'
  | 'service_degraded'
  | 'service_down'
  | 'service_recovered';

export interface SystemEventInput {
  type: SystemEventType;
  summary: string;
  dedupeKey: string;
  repository?: string | null;
  branch?: string | null;
  path?: string | null;
  sourceUrl?: string | null;
}

export async function recordSystemEvent(event: SystemEventInput): Promise<void> {
  if (!isDbConfigured()) throw new Error('System event persistence requires DATABASE_URL');
  await dbQuery(
    `INSERT INTO system_events(event_type, summary, repository, branch, path, source_url, dedupe_key)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      event.type,
      event.summary.slice(0, 500),
      event.repository || null,
      event.branch || null,
      event.path || null,
      event.sourceUrl || null,
      event.dedupeKey.slice(0, 500)
    ]
  );
}

export function repositoryFileUrl(repository: string, branch: string, path: string, removed = false): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const ref = encodeURIComponent(branch);
  return `https://github.com/${repository}/${removed ? 'commit' : 'blob'}/${ref}${removed ? '' : `/${encodedPath}`}`;
}
