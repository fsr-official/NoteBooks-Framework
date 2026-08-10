#!/usr/bin/env node
/**
 * Smoke test for /api/raw.
 *
 * Hits the endpoint with a handful of path shapes that exercise the
 * repoPath-stripping / URL-extraction logic in raw.ts, and reports
 * whether each one got the response it should have.
 *
 * Usage:
 *   node test-raw.js
 *   BASE_URL=https://your-deployed-app.vercel.app node test-raw.js
 *
 * Requires Node 18+ (uses global fetch). No dependencies.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

// Edit these to match a file you know actually exists in the configured repo.
const REAL_FILE =
  "AI-NOTES/CHEMISTRY/CHEMISTRY02-STRUCTURE_OF_ATOM/CHEMISTRY02-STRUCTURE_OF_ATOM-NOTES.md";
const REPO_FOLDER_NAME = "NCERT-Science"; // must match repoCfg.repo's folder name

const cases = [
  {
    name: "correct repoPath (no prefix)",
    path: REAL_FILE,
    method: "GET",
    expect: { status: 200 },
  },
  {
    name: "display path with repo-folder prefix (should be stripped)",
    path: `${REPO_FOLDER_NAME}/${REAL_FILE}`,
    method: "GET",
    expect: { status: 200 },
  },
  {
    name: "full raw.githubusercontent.com URL (should extract path)",
    path: `https://raw.githubusercontent.com/fsr-science/NCERT-Science/main/${REAL_FILE}`,
    method: "GET",
    expect: { status: 200 },
  },
  {
    name: "unsupported non-raw http URL",
    path: "https://example.com/some/file.md",
    method: "GET",
    expect: { status: 400 },
  },
  {
    name: "missing path param",
    path: null,
    method: "GET",
    expect: { status: 400 },
  },
  {
    name: "nonexistent file",
    path: "AI-NOTES/DOES/NOT/EXIST.md",
    method: "GET",
    expect: { status: 404 },
  },
  {
    name: "OPTIONS preflight",
    path: REAL_FILE,
    method: "OPTIONS",
    expect: { status: 204 },
  },
];

function buildUrl(path) {
  const url = new URL("/api/raw", BASE_URL);
  if (path !== null) url.searchParams.set("path", path);
  return url.toString();
}

async function runCase(tc) {
  const url = buildUrl(tc.path);
  let res, bodyPreview = "";
  try {
    res = await fetch(url, { method: tc.method });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      const json = await res.json().catch(() => null);
      bodyPreview = json ? JSON.stringify(json) : "<unparseable json>";
    } else if (res.status !== 204) {
      const text = await res.text();
      bodyPreview = `[${contentType || "unknown type"}, ${text.length} bytes]`;
    }
  } catch (err) {
    console.log(`FAIL  ${tc.name}\n      request threw: ${err.message}\n      url: ${url}\n`);
    return false;
  }

  const statusOk = res.status === tc.expect.status;
  const corsOk = res.headers.get("access-control-allow-origin") === "*";

  const pass = statusOk && corsOk;
  const line = `${pass ? "PASS" : "FAIL"}  ${tc.name}`;
  console.log(line);
  if (!pass) {
    console.log(`      url:      ${url}`);
    console.log(`      method:   ${tc.method}`);
    console.log(`      expected: status ${tc.expect.status}`);
    console.log(`      got:      status ${res.status}${statusOk ? "" : "  <-- mismatch"}`);
    console.log(`      cors:     ${res.headers.get("access-control-allow-origin") || "(missing)"}${corsOk ? "" : "  <-- mismatch"}`);
    if (bodyPreview) console.log(`      body:     ${bodyPreview}`);
  }
  return pass;
}

(async () => {
  console.log(`Testing ${BASE_URL}/api/raw\n`);
  let passed = 0;
  for (const tc of cases) {
    if (await runCase(tc)) passed++;
  }
  console.log(`\n${passed}/${cases.length} passed`);
  process.exit(passed === cases.length ? 0 : 1);
})();