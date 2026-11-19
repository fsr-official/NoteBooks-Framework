"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      const cleanDevelopmentCaches = async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const projectRegistrations = registrations.filter((registration) =>
          [registration.active, registration.waiting, registration.installing]
            .some((worker) => worker && new URL(worker.scriptURL).pathname === "/service-worker.js"),
        );
        const controlsThisPage = navigator.serviceWorker.controller
          && new URL(navigator.serviceWorker.controller.scriptURL).pathname === "/service-worker.js";
        const cacheNames = await caches.keys();
        const projectCaches = cacheNames.filter((name) =>
          name.startsWith("notebooks-v2-") || name.startsWith("webman-v"),
        );
        const reloadKey = "notebooks:dev:service-worker-cleanup";

        if (projectRegistrations.length === 0 && projectCaches.length === 0 && !controlsThisPage) {
          sessionStorage.removeItem(reloadKey);
          return;
        }

        await Promise.all([
          ...projectRegistrations.map((registration) => registration.unregister()),
          ...projectCaches.map((name) => caches.delete(name)),
        ]);

        if (sessionStorage.getItem(reloadKey) !== "done") {
          sessionStorage.setItem(reloadKey, "done");
          window.location.reload();
        }
      };

      void cleanDevelopmentCaches().catch((error: unknown) => {
        console.warn("NoteBooks development cache cleanup failed", error);
      });
      return;
    }

    void navigator.serviceWorker.register("/service-worker.js?v=notebooks-v2-4", {
      updateViaCache: "none",
    }).catch((error: unknown) => {
      console.warn("NoteBooks offline support could not be enabled", error);
    });
  }, []);

  return null;
}
