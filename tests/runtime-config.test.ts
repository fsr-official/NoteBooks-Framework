import { describe, it, expect } from 'vitest';
import { assertRuntimeConfig, validateRuntimeConfig } from '../src/lib/runtime-config';

describe('runtime config validation', () => {
  it('fails in production when required backend secrets are missing', () => {
    const previous = { ...process.env };

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.GITHUB_REPO;
      delete process.env.GITHUB_COMMUNITY_REPO;
      delete process.env.GITHUB_ISSUES_REPO;
      delete process.env.DATABASE_URL;

      expect(() => assertRuntimeConfig()).toThrow(/JWT_SECRET|GITHUB_REPO|DATABASE_URL/);
      expect(validateRuntimeConfig()).toEqual(expect.arrayContaining([
        expect.stringMatching(/JWT_SECRET|GITHUB_REPO|DATABASE_URL/),
      ]));
    } finally {
      process.env = previous;
    }
  });

  it('allows dev defaults when not in production', () => {
    const previous = { ...process.env };

    try {
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_SECRET;
      delete process.env.GITHUB_REPO;
      delete process.env.GITHUB_COMMUNITY_REPO;
      delete process.env.GITHUB_ISSUES_REPO;

      expect(() => assertRuntimeConfig()).not.toThrow();
      expect(validateRuntimeConfig()).toEqual([]);
    } finally {
      process.env = previous;
    }
  });
});
