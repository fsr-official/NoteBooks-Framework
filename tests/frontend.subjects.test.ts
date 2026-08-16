import request from 'supertest';
import { describe, it, expect } from 'vitest';
import createApp from '../src/server/server';

describe('frontend subject fragments', () => {
  it('serves the science subject fragment and /science page', async () => {
    const app = createApp();
    const frag = await request(app).get('/public/subjects/science.html');
    expect(frag.status).toBe(200);
    expect(frag.text).toContain('Science subject content placeholder');

    const page = await request(app).get('/science');
    expect(page.status).toBe(200);
    // page should include the app shell so the client loader can inject the fragment
    expect(page.text.length).toBeGreaterThan(200);
  });
});
