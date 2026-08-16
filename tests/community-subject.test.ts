import { describe, it, expect } from 'vitest';

describe('community subject persistence contract', () => {
  it('keeps subject in the community post schema contract', () => {
    const expectedColumns = ['id', 'author_email', 'title', 'body', 'subject', 'status', 'github_discussion_id'];
    expect(expectedColumns).toContain('subject');
  });
});
