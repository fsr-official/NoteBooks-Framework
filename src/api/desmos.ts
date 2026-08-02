export default async function handler(req, res) {
  const apiKey = process.env.DESMOS_API_KEY || '';
  const upstream = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${apiKey}`;

  try {
    const r = await fetch(upstream);
    if (!r.ok) { res.status(r.status).end(); return; }
    const body = await r.text();

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400');   // cache for 1 day
    res.status(200).send(body);
  } catch (e) {
    res.status(502).end();
  }
}