import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

type UrlEvent = { url: string };

declare global {
  interface Window {
    __notebooksObservabilityInitialized?: boolean;
  }
}

function sanitizeUrl<T extends UrlEvent>(event: T): T {
  try {
    const url = new URL(event.url, window.location.origin);
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return event;
  }
}

function isLocalDevelopment(): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

/**
 * Starts Vercel Web Analytics and Speed Insights for the static browser app.
 *
 * The packages' Next.js components are intentionally not used: this project
 * serves HTML shells and vanilla JavaScript. Vercel's build-time client config
 * supplies the /_vercel collection routes in deployed environments.
 */
export function initObservability(): void {
  if (typeof window === 'undefined' || window.__notebooksObservabilityInitialized) return;
  window.__notebooksObservabilityInitialized = true;

  const local = isLocalDevelopment();
  const mode = local ? 'development' : 'production';

  inject({
    framework: 'vanilla',
    mode,
    beforeSend: sanitizeUrl
  });

  injectSpeedInsights({
    framework: 'vanilla',
    scriptSrc: local
      ? 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js'
      : '/_vercel/speed-insights/script.js',
    debug: local,
    route: window.location.pathname,
    beforeSend: sanitizeUrl
  });
}

initObservability();
