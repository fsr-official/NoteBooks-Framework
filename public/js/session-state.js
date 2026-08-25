/* Shared session bootstrap for lightweight pages. It deduplicates reads and fails fast to local state. */
(() => {
  const requestJson = (url, options = {}, timeoutMs = 1800) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json();
      })
      .finally(() => window.clearTimeout(timeout));
  };

  let sessionPromise;
  const readSession = () => {
    if (sessionPromise) return sessionPromise;
    sessionPromise = requestJson('/api/session', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }, 1500).catch(() => ({ session: {}, persisted: false }));
    return sessionPromise;
  };

  window.noteBooksRequestJson = requestJson;
  window.noteBooksSession = readSession;
})();
