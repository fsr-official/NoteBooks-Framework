import "server-only";

type DesmosApiKind = "graphing" | "3d";

const UNAVAILABLE_SCRIPT = `
(function () {
  window.Desmos = window.Desmos || {};
  window.Desmos.__notebooksUnavailable = true;
  console.warn('Desmos API key is not configured. Desmos blocks will not initialize.');
}());
`;

function scriptResponse(script: string, maxAge: number): Response {
  return new Response(script, {
    headers: {
      "Cache-Control": `public, max-age=${maxAge}`,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function getDesmosApiScript(kind: DesmosApiKind): Promise<Response> {
  const apiKey = process.env.DESMOS_API_KEY?.trim();
  if (!apiKey) return scriptResponse(UNAVAILABLE_SCRIPT, 60);

  const url = `https://www.desmos.com/api/v1.11.4/calculator.js?apiKey=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/javascript, text/javascript, */*;q=0.8" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Desmos upstream returned HTTP ${response.status}`);
    return scriptResponse(await response.text(), 300);
  } catch (error) {
    console.warn(`[api/desmos:${kind}] upstream unavailable`, error instanceof Error ? error.message : error);
    return scriptResponse(UNAVAILABLE_SCRIPT, 60);
  }
}
