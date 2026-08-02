// bin/gh-proxy.js — GitHub API abstraction (DEPRECATED)
// 
// ARCHITECTURE NOTE:
// With a read-only PAT stored only in Vercel env vars, this file is no longer needed.
// All GitHub operations should go through /api/gh.js instead:
//   - Browser makes POST request to /api/gh.js
//   - Vercel function uses process.env.GITHUB_PAT (never exposed to client)
//   - Secure + cleaner separation of concerns
//
// If you need user-specific PAT support in the future, this can be refactored
// to support custom credentials via window.S object. For now, use the server API.

async function ghProxy(action, params = {}) {
  // Fallback to /api/gh.js for all operations
  // This maintains compatibility if ghProxy is called from legacy code
  try {
    const response = await fetch('/api/gh.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { ok: false, error: data.error || `API error (${response.status})`, status: response.status };
    }

    return { ok: true, data };
  } catch (e) {
    console.error('[ghProxy] Network error:', e);
    return { ok: false, error: e.message };
  }
}

window.ghProxy = ghProxy;