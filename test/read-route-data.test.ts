import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  C2_FIXTURE_ROUTE,
  c2FixtureReadRouteDataProvider,
} from "../src/lib/read-route-fixture";
import { getReadRouteDataProvider } from "../src/lib/read-route-data";

describe("C2 read route data provider", () => {
  it("selects the fixture provider only for its exact local identity and flag", () => {
    expect(getReadRouteDataProvider(C2_FIXTURE_ROUTE, {
      NODE_ENV: "development",
      NOTEBOOKS_C2_FIXTURE: "1",
    }).kind).toBe("fixture");

    expect(getReadRouteDataProvider(C2_FIXTURE_ROUTE, {
      NODE_ENV: "test",
      NOTEBOOKS_C2_FIXTURE: "1",
    }).kind).toBe("fixture");

    expect(getReadRouteDataProvider({
      ...C2_FIXTURE_ROUTE,
      path: "test/fixtures/read-c2/other.mdx",
    }, {
      NODE_ENV: "development",
      NOTEBOOKS_C2_FIXTURE: "1",
    }).kind).toBe("production");

    expect(getReadRouteDataProvider({
      ...C2_FIXTURE_ROUTE,
      branch: "other",
    }, {
      NODE_ENV: "development",
      NOTEBOOKS_C2_FIXTURE: "1",
    }).kind).toBe("production");

    expect(getReadRouteDataProvider(C2_FIXTURE_ROUTE, {
      NODE_ENV: "development",
      NOTEBOOKS_C2_FIXTURE: "true",
    }).kind).toBe("production");
  });

  it("keeps the production provider selected when the fixture flag is set", () => {
    const provider = getReadRouteDataProvider(C2_FIXTURE_ROUTE, {
      NODE_ENV: "production",
      NOTEBOOKS_C2_FIXTURE: "1",
    });

    expect(provider.kind).toBe("production");
  });

  it("returns fixture content with its Git blob SHA", async () => {
    const contents = await readFile(new URL("./fixtures/read-c2/source.mdx", import.meta.url));
    const expectedSha = createHash("sha1")
      .update(Buffer.from(`blob ${contents.byteLength}\0`, "utf8"))
      .update(contents)
      .digest("hex");
    const url = new URL("https://notebooks.internal/api/raw");
    url.searchParams.set("owner", C2_FIXTURE_ROUTE.owner);
    url.searchParams.set("repo", C2_FIXTURE_ROUTE.repository);
    url.searchParams.set("path", C2_FIXTURE_ROUTE.path);

    const response = await c2FixtureReadRouteDataProvider.servePublicContent(
      new Request(url),
      C2_FIXTURE_ROUTE,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-File-SHA")).toBe(expectedSha);
    expect(response.headers.get("ETag")).toBe(`"${expectedSha}"`);
    expect(await response.text()).toBe(contents.toString("utf8"));
  });
});
