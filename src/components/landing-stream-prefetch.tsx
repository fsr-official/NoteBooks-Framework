"use client";

import { useEffect } from "react";
import { STREAMS } from "@/lib/library-streams";

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const publicStreamJsonUrls = STREAMS.map(({ id }) => `/api/public/json/${id}-tree.json`);

export default function LandingStreamPrefetch() {
  useEffect(() => {
    let cancelled = false;
    let scheduledHandle: number | null = null;
    let scheduledAsIdleWork = false;
    let nextUrlIndex = 0;
    let activeRequest: AbortController | null = null;
    const idleWindow = window as IdleWindow;

    const prefetchNext = async () => {
      if (cancelled || nextUrlIndex >= publicStreamJsonUrls.length) return;

      const url = publicStreamJsonUrls[nextUrlIndex];
      nextUrlIndex += 1;
      const controller = new AbortController();
      activeRequest = controller;

      try {
        const response = await fetch(url, {
          cache: "force-cache",
          credentials: "omit",
          signal: controller.signal,
        });
        if (response.ok && response.body) {
          const reader = response.body.getReader();
          try {
            while (!cancelled) {
              const { done } = await reader.read();
              if (done) break;
            }
          } finally {
            reader.releaseLock();
          }
        }
      } catch {
        // Prefetch is optional; a failed public index must not affect the landing page.
      } finally {
        if (activeRequest === controller) activeRequest = null;
        if (!cancelled) scheduleNext();
      }
    };

    const scheduleNext = () => {
      if (cancelled || nextUrlIndex >= publicStreamJsonUrls.length) return;

      if (idleWindow.requestIdleCallback) {
        scheduledAsIdleWork = true;
        scheduledHandle = idleWindow.requestIdleCallback((deadline) => {
          scheduledHandle = null;
          if (cancelled) return;
          if (!deadline.didTimeout && deadline.timeRemaining() < 1) {
            scheduleNext();
            return;
          }
          void prefetchNext();
        }, { timeout: 4000 });
        return;
      }

      scheduledAsIdleWork = false;
      scheduledHandle = window.setTimeout(() => {
        scheduledHandle = null;
        void prefetchNext();
      }, 1200);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      activeRequest?.abort();
      if (scheduledHandle !== null) {
        if (scheduledAsIdleWork) idleWindow.cancelIdleCallback?.(scheduledHandle);
        else window.clearTimeout(scheduledHandle);
      }
    };
  }, []);

  return null;
}
