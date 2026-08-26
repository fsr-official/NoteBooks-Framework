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

  const request = (url, options = {}) => {
    const target = new URL(url, window.location.href);
    const headers = target.origin === window.location.origin
      ? csrfHeaders(options.headers || {})
      : new Headers(options.headers || {});
    return fetch(url, {
      ...options,
      credentials: options.credentials || 'same-origin',
      headers
    });
  };

  window.noteBooksCsrfHeaders = csrfHeaders;
  window.noteBooksRequest = request;
})();
