import request from 'supertest';
import { describe, it, expect } from 'vitest';
import createApp from '../src/server/server';

describe('frontend subject shell', () => {
  it('serves the canonical subject shell and subject routes', async () => {
    const app = createApp();

    const shell = await request(app).get('/public/html/streams.html');
    expect(shell.status).toBe(200);
    expect(shell.text).toContain('class="subject-shell-page"');
    expect(shell.text).toContain('/public/js/app.js');

    const page = await request(app).get('/science');
    expect(page.status).toBe(200);
    expect(page.text).toContain('class="subject-shell-page"');
  });
});
