import type { Request, Response } from 'express';

const NO_KEY_FALLBACK = `
if (typeof window !== 'undefined') {
  console.warn('Desmos API key is not configured. Desmos blocks will not initialize.');
  window.Desmos = window.Desmos || {};
}
`;

export default function handler(req: Request, res: Response) {
  const apiKey = process.env.DESMOS_API_KEY?.trim();

  // Diagnostic: log whether the key was loaded (don't print the key itself)
  console.log('[api/desmos] Loaded Key:', apiKey ? 'EXISTS' : 'MISSING');

  if (!apiKey) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(NO_KEY_FALLBACK);
  }

  // Redirect directly to the 3D bundle so relative imports load from desmos.com
  // Use the supported 3D channel (v1.10) rather than v1.12 which breaks 3D.
  const upstream = `https://www.desmos.com/api/v1.10/calculator3d.js?apiKey=${apiKey}`;
  return res.redirect(307, upstream);
}
