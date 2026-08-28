import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(process.cwd());
const vercelConfig = JSON.parse(fs.readFileSync(path.join(projectDir, 'vercel.json'), 'utf8')) as {
  cleanUrls?: boolean;
  rewrites?: Array<{ source: string; destination: string }>;
};

describe('Vercel clean URL routing', () => {
  it('uses extensionless destinations for clean URL HTML rewrites', () => {
    expect(vercelConfig.cleanUrls).toBe(true);

    const routes = new Map((vercelConfig.rewrites ?? []).map((route) => [route.source, route.destination]));
    expect(routes.get('/files/:path*')).toBe('/api/workspace-file?path=:path*');
    expect(routes.get('/settings')).toBe('/public/html/settings');
    expect(routes.get('/settings/')).toBe('/public/html/settings');
    expect(routes.get('/science')).toBe('/public/html/streams');
    expect(routes.get('/community')).toBe('/public/html/portal');

    for (const destination of routes.values()) {
      expect(destination).not.toMatch(/\.html$/);
    }
  });
});
