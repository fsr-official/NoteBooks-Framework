"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/service-worker.js?v=notebooks-v2-1", {
      updateViaCache: "none",
    }).catch((error: unknown) => {
      console.warn("NoteBooks offline support could not be enabled", error);
    });
  }, []);

  return null;
}
