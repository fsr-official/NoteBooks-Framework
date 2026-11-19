/* Keep lightweight pages on the current ServiceWorker without loading the explorer runtime. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js?v=20261103-runtime-content-catalog', { updateViaCache: 'none' })
    .catch(() => {
      // ServiceWorker failure must not block page rendering.
    });
}
