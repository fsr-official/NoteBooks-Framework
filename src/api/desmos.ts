import type { Request, Response } from 'express';

const NO_KEY_FALLBACK = `
if (typeof window !== 'undefined') {
  console.warn('Desmos API key is not configured. Desmos blocks will not initialize.');
  window.Desmos = window.Desmos || {};
}
`;

export default async function handler(req: Request, res: Response) {
  const apiKey = process.env.DESMOS_API_KEY?.trim();
  if (!apiKey) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(NO_KEY_FALLBACK);
  }

  const upstream = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${apiKey}`;

  try {
    const r = await fetch(upstream);
    if (!r.ok) { return res.status(r.status).end(); }
    const body = await r.text();

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(body);
  } catch (e) {
    console.error('[api/desmos]', e);
    res.status(502).end();
  }
}
