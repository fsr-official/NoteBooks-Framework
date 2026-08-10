import { describe, expect, it } from 'vitest';
import { getOpenPrLimitError } from '../src/api/submit-pr.ts';

describe('open PR cap helper', () => {
  it('allows submission when the account is below the open-PR limit', () => {
    expect(getOpenPrLimitError([], 'alice@example.com', 3)).toBeNull();
  });

  it('blocks submission once the account reaches the configured limit', () => {
    const openPulls = [
      { body: 'Account ID: alice@example.com', head: { ref: 'pr/edit-alice-1' } },
      { body: 'Account ID: alice@example.com', head: { ref: 'pr/edit-alice-2' } }
    ];

    expect(getOpenPrLimitError(openPulls, 'alice@example.com', 2)).toBe('Open PR limit reached (2)');
  });
});
