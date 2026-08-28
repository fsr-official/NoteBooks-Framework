/* Keep lightweight pages on the current ServiceWorker without loading the explorer runtime. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js?v=20260828-sw-v41', { updateViaCache: 'none' })
    .catch(() => {
      // ServiceWorker failure must not block page rendering.
    });
}
