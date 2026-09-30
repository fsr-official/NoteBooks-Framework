import { describe, expect, it, vi } from 'vitest';
import { attachCacheLifecycleHooks } from '../src/lib/cache-lifecycle.ts';

describe('cache lifecycle hooks', () => {
  it('refreshes when the page becomes visible and clears cache when hidden or closed', async () => {
    const listeners: Record<string, Function> = {};
    const platform = {
      addEventListener: vi.fn((event: string, callback: Function) => {
        listeners[event] = callback;
      }),
      removeEventListener: vi.fn(),
      document: { visibilityState: 'hidden' }
    };

    const onVisible = vi.fn();
    const onHidden = vi.fn();
    const onClosed = vi.fn();

    const teardown = attachCacheLifecycleHooks({ onVisible, onHidden, onClosed }, platform as any);

    listeners.visibilitychange?.();
    expect(onHidden).toHaveBeenCalledTimes(1);

    platform.document.visibilityState = 'visible';
    listeners.visibilitychange?.();
    expect(onVisible).toHaveBeenCalledTimes(1);

    listeners.pagehide?.();
    expect(onClosed).toHaveBeenCalledTimes(1);

    teardown();
    expect(platform.removeEventListener).toHaveBeenCalled();
  });
});
