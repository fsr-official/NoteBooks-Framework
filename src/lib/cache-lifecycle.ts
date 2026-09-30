export interface CacheLifecycleHooks {
  onVisible?: () => void | Promise<void>;
  onHidden?: () => void | Promise<void>;
  onClosed?: () => void | Promise<void>;
}

export interface CacheLifecycleTarget {
  addEventListener: (event: string, handler: (...args: any[]) => void) => void;
  removeEventListener: (event: string, handler: (...args: any[]) => void) => void;
  document?: { visibilityState?: 'hidden' | 'visible' | 'prerender' };
}

export function attachCacheLifecycleHooks(
  hooks: CacheLifecycleHooks,
  target: CacheLifecycleTarget = globalThis as any
): () => void {
  const handleVisibilityChange = () => {
    const visibilityState = target.document?.visibilityState;
    if (visibilityState === 'hidden') {
      void Promise.resolve(hooks.onHidden?.());
      return;
    }

    if (visibilityState === 'visible') {
      void Promise.resolve(hooks.onVisible?.());
    }
  };

  const handlePageHide = () => {
    void Promise.resolve(hooks.onClosed?.());
  };

  target.addEventListener('visibilitychange', handleVisibilityChange);
  target.addEventListener('pagehide', handlePageHide);
  target.addEventListener('beforeunload', handlePageHide);
  target.addEventListener('focus', handleVisibilityChange);

  return () => {
    target.removeEventListener('visibilitychange', handleVisibilityChange);
    target.removeEventListener('pagehide', handlePageHide);
    target.removeEventListener('beforeunload', handlePageHide);
    target.removeEventListener('focus', handleVisibilityChange);
  };
}
