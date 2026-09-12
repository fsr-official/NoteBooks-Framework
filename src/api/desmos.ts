import type { Request, Response } from 'express';

const NO_KEY_FALLBACK = `
(function () {
  window.Desmos = window.Desmos || {};
  window.Desmos.__notebooksUnavailable = true;
  console.warn('Desmos API key is not configured. Desmos blocks will not initialize.');
}());
`;

function sendScript(res: Response, body: string, maxAge: number) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  return res.status(200).send(body);
}

export function createDesmosHandler(kind: 'graphing' | '3d') {
  return async function desmosHandler(_req: Request, res: Response) {
    const apiKey = process.env.DESMOS_API_KEY?.trim();
    if (!apiKey) return sendScript(res, NO_KEY_FALLBACK, 60);

    const version = '1.11';
    const file = kind === '3d' ? 'calculator3d.js' : 'calculator.js';
    const upstream = `https://www.desmos.com/api/v${version}/${file}?apiKey=${encodeURIComponent(apiKey)}`;
    try {
      const response = await fetch(upstream, { headers: { accept: 'application/javascript, text/javascript, */*;q=0.8' } });
      if (!response.ok) throw new Error(`Desmos upstream returned ${response.status}`);
      return sendScript(res, await response.text(), 300);
    } catch (error) {
      console.warn(`[api/desmos:${kind}] upstream unavailable`, error instanceof Error ? error.message : error);
      return sendScript(res, NO_KEY_FALLBACK, 60);
    }
  };
}

export const graphingHandler = createDesmosHandler('graphing');
export const calculator3dHandler = createDesmosHandler('3d');
export default graphingHandler;
