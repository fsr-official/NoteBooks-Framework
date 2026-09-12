import type { Request, Response } from 'express';

const NO_KEY_FALLBACK = `
if (typeof window !== 'undefined') {
  console.warn('Desmos API key is not configured. Desmos blocks will not initialize.');
  window.Desmos = window.Desmos || {};
}
`;

export default async function handler(_req: Request, res: Response) {
  const apiKey = process.env.DESMOS_API_KEY?.trim();

  // Diagnostic: log whether the key was loaded (don't print the key itself)
  console.log('[api/desmos] Loaded Key:', apiKey ? 'EXISTS' : 'MISSING');

  if (!apiKey) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(NO_KEY_FALLBACK);
  }

  const upstream = `https://www.desmos.com/api/v1.10/calculator3d.js?apiKey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(upstream, {
      headers: {
        accept: 'application/javascript, text/javascript, */*;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`Desmos upstream returned ${response.status}`);
    }

    const scriptText = await response.text();
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(200).send(scriptText);
  } catch (error) {
    console.warn('[api/desmos] Fallback to local stub:', error instanceof Error ? error.message : error);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(NO_KEY_FALLBACK);
  }
}
