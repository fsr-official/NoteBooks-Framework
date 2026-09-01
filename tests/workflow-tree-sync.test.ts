import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workflowDir = path.join(root, '.github', 'workflows');
const treeSync = fs.readFileSync(path.join(workflowDir, 'tree-sync.yml'), 'utf8');

describe('canonical tree-sync workflow', () => {
  it('keeps only CI, deployment, integration, and the canonical tree-sync workflows', () => {
    expect(fs.readdirSync(workflowDir).sort()).toEqual(['ci.yml', 'deploy-staging.yml', 'integration.yml', 'tree-sync.yml']);
  });

  it('generates and validates files.json before sending one signed rebuild POST', () => {
    expect(treeSync).toContain('python3 fmtree.py --out files.json');
    expect(treeSync).toContain('test -s files.json');
    expect(treeSync).toContain('json.load(handle)');
    expect(treeSync).toContain('X-Notebooks-Workflow-Origin: $REBUILD_ORIGIN');
    expect(treeSync).toContain('X-Notebooks-Signature: $signature');
    expect(treeSync).toContain('--data-binary @payload.json');
    expect(treeSync).toContain('TREE_REBUILD_URL');
    expect(treeSync).toContain("git commit -m 'chore: refresh files.json [skip ci]'");
    expect(treeSync).toContain('git push origin "HEAD:${GITHUB_REF_NAME}"');
    expect(treeSync).not.toContain('APP_WEBHOOK_URL');
  });

  it('derives the origin from the calling repository and prevents stale queued runs', () => {
    expect(treeSync).toContain('REBUILD_ORIGIN: ${{ github.repository }}');
    expect(treeSync).toContain('cancel-in-progress: true');
    expect(treeSync).toContain('GITHUB_REF_NAME');
    expect(treeSync).toContain('GITHUB_REPOSITORY');
  });
});
