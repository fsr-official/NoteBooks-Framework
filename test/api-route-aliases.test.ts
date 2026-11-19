import { beforeEach, describe, expect, it, vi } from "vitest";

const { servePublicContent, getDesmosApiScript } = vi.hoisted(() => ({
  servePublicContent: vi.fn(),
  getDesmosApiScript: vi.fn(),
}));

vi.mock("@/lib/public-content-route", () => ({ servePublicContent }));
vi.mock("@/lib/desmos-api", () => ({ getDesmosApiScript }));

import { GET as getRaw, HEAD as headRaw } from "../src/app/api/raw/route";
import { GET as getRawAlias, HEAD as headRawAlias } from "../src/app/api/raw.js/route";
import { GET as getMedia, HEAD as headMedia } from "../src/app/api/media/route";
import { GET as getMediaAlias, HEAD as headMediaAlias } from "../src/app/api/media.js/route";
import { GET as getDesmos } from "../src/app/api/desmos.js/route";
import { GET as getDesmos3d } from "../src/app/api/desmos3d.js/route";

describe("API route aliases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["raw GET", getRaw, "GET", "markdown"],
    ["raw HEAD", headRaw, "HEAD", "markdown"],
    ["raw.js GET", getRawAlias, "GET", "markdown"],
    ["raw.js HEAD", headRawAlias, "HEAD", "markdown"],
    ["media GET", getMedia, "GET", "media"],
    ["media HEAD", headMedia, "HEAD", "media"],
    ["media.js GET", getMediaAlias, "GET", "media"],
    ["media.js HEAD", headMediaAlias, "HEAD", "media"],
  ])("%s delegates the request to the shared content handler", async (_label, handler, method, kind) => {
    const request = new Request("https://example.test/api/content", { method });
    const response = new Response("ok");
    servePublicContent.mockResolvedValue(response);

    await expect(handler(request)).resolves.toBe(response);
    expect(servePublicContent).toHaveBeenCalledWith(request, kind);
  });

  it.each([
    ["graphing", getDesmos, "graphing"],
    ["3D", getDesmos3d, "3d"],
  ])("Desmos %s route selects the matching script", async (_label, handler, kind) => {
    const response = new Response("script");
    getDesmosApiScript.mockResolvedValue(response);

    await expect(handler()).resolves.toBe(response);
    expect(getDesmosApiScript).toHaveBeenCalledWith(kind);
  });
});
