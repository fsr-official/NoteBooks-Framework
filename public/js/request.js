/* Shared same-origin request helpers. This file intentionally contains no user data or authentication tokens. */
(() => {
  const readCookie = (name) => {
    const prefix = `${encodeURIComponent(name)}=`;
    const entry = document.cookie.split('; ').find((part) => part.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
  };

  const csrfHeaders = (headers = {}) => {
    const next = new Headers(headers);
    const token = readCookie('csrf');
    if (token) next.set('x-csrf-token', token);
    return next;
  };

  const hasCsrfCookie = () => Boolean(readCookie('csrf'));
  let csrfBootstrapPromise = null;
  const bootstrapCsrf = () => {
    if (hasCsrfCookie()) return Promise.resolve();
    if (!csrfBootstrapPromise) {
      csrfBootstrapPromise = fetch('/api/session', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      }).then(() => undefined).catch(() => undefined).finally(() => {
        csrfBootstrapPromise = null;
      });
    }
    return csrfBootstrapPromise;
  };
  const request = async (url, options = {}) => {
    const target = new URL(url, window.location.href);
    const method = String(options.method || 'GET').toUpperCase();
    const sameOrigin = target.origin === window.location.origin;
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (sameOrigin && unsafe) await bootstrapCsrf();
    const send = () => {
      const headers = sameOrigin ? csrfHeaders(options.headers || {}) : new Headers(options.headers || {});
      return fetch(url, {
        ...options,
        credentials: options.credentials || 'same-origin',
        headers
      });
    };
    let response = await send();
    if (sameOrigin && unsafe && response.status === 403 && !hasCsrfCookie()) {
      await bootstrapCsrf();
      response = await send();
    }
    return response;
  };

  window.noteBooksCsrfHeaders = csrfHeaders;
  window.noteBooksRequest = request;
})();
