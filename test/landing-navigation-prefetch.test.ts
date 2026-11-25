import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "../src/app/page";
import { SiteNavigation } from "../src/components/site-navigation";

function renderNavigation(activePage: "home" | "science") {
  return renderToStaticMarkup(createElement(SiteNavigation, { activePage }));
}

describe("landing navigation", () => {
  it("keeps the shared destinations and active state without a Collections nav link", () => {
    const markup = renderNavigation("science");
    const navigation = markup.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];

    expect(navigation).toBeDefined();
    expect(navigation).not.toContain("Collections");
    for (const href of [
      "/",
      "/lowersecondary",
      "/science",
      "/commerce",
      "/humanities",
      "/developers",
      "/account",
      "/register",
    ]) {
      expect(navigation).toContain(`href="${href}"`);
    }
    expect(navigation).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/science"/);
  });

  it("retains the landing collections content and theme picker", () => {
    const markup = renderToStaticMarkup(createElement(HomePage));
    const navigation = markup.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];

    expect(navigation).toBeDefined();
    expect(navigation).not.toContain("Collections");
    expect(markup).toContain('id="collections"');
    expect(markup).toContain("A shared shelf for curious minds.");
    expect(markup).toContain("Explore Science");
    expect(markup).toContain('aria-label="Appearance settings"');
  });

  it("marks Home as active while keeping its theme picker available", () => {
    const markup = renderNavigation("home");
    const navigation = markup.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];

    expect(navigation).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/"/);
    expect(navigation).toContain('aria-label="Appearance settings"');
  });
});
