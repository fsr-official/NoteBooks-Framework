import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workflowDir = path.join(root, '.github', 'workflows');
const treeSync = fs.readFileSync(path.join(workflowDir, 'tree-sync.yml'), 'utf8');
const deployStaging = fs.readFileSync(path.join(workflowDir, 'deploy-staging.yml'), 'utf8');
const systemWorkflows = fs.readFileSync(path.join(workflowDir, 'system-workflows.yml'), 'utf8');

describe('canonical tree-sync workflow', () => {
  it('keeps the canonical CI, deployment, integration, tree-sync, and System workflows', () => {
    expect(fs.readdirSync(workflowDir).sort()).toEqual([
      'ci.yml',
      'deploy-staging.yml',
      'integration.yml',
      'system-workflows.yml',
      'tree-sync.yml'
    ]);
  });

  it('probes uptime and invokes the signed worker every five minutes', () => {
    expect(systemWorkflows).toContain("cron: '*/5 * * * *'");
    expect(systemWorkflows).toContain('NOTEBOOKS_UPDATE_URL');
    expect(systemWorkflows).toContain('NOTEBOOKS_UPDATE_SECRET');
    expect(systemWorkflows).toContain('/api/health');
    expect(systemWorkflows).toContain('/api/system-workflows');
    expect(systemWorkflows).toContain('X-Notebooks-Signature');
    expect(systemWorkflows).toContain('actions/cache/restore@v4');
    expect(systemWorkflows).toContain('actions/cache/save@v4');
    expect(systemWorkflows).toContain('.system-uptime-state.json');
  });

  it('generates files.json and sends one signed runtime content update', () => {
    expect(treeSync).toContain('python3 fmtree.py --out files.json');
    expect(treeSync).toContain('test -s files.json');
    expect(treeSync).toContain('json.load(handle)');
    expect(treeSync).toContain('NOTEBOOKS_UPDATE_URL');
    expect(treeSync).toContain('NOTEBOOKS_UPDATE_SECRET');
    expect(treeSync).toContain('X-NoteBooks-Signature: $signature');
    expect(treeSync).toContain('--data-binary @payload.json');
    expect(treeSync).toContain('schemaVersion:1,kind:"content"');
    expect(treeSync).toContain('commitSha:$commitSha');
    expect(treeSync).toContain("git commit -m 'chore: refresh files.json [skip ci]'");
    expect(treeSync).toContain('git push origin "HEAD:${GITHUB_REF_NAME}"');
    expect(treeSync).not.toContain('TREE_REBUILD_URL');
  });

  it('uses the Framework production environment for Vercel credentials', () => {
    expect(deployStaging).toContain('environment: Production – notebooks-framework');
  });

  it('passes the Vercel token explicitly to every CLI deployment operation', () => {
    expect(deployStaging).toContain('pull --yes');
    expect(deployStaging).toContain('pull --yes\n          --token="$VERCEL_TOKEN"');
    expect(deployStaging).toContain('build --prod\n          --token="$VERCEL_TOKEN"');
    expect(deployStaging).toContain('deploy --prebuilt --prod\n          --token="$VERCEL_TOKEN"');
  });

  it('uses the calling repository commit and prevents stale queued runs', () => {
    expect(treeSync).toContain('cancel-in-progress: true');
    expect(treeSync).toContain('GITHUB_REF_NAME');
    expect(treeSync).toContain('GITHUB_REPOSITORY');
  });
});
