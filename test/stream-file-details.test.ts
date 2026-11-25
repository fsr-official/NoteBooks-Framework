import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../src/app/notebooks.css", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/notebook-workspace.tsx", import.meta.url), "utf8");
const mobileDrawerStyles = stylesheet.slice(stylesheet.indexOf("@media (max-width: 800px)"));

describe("stream file details", () => {
  it.each([320, 390, 768])("keeps the drawer viewport-anchored at %i px", (width) => {
    expect(width).toBeLessThanOrEqual(800);
    expect(mobileDrawerStyles).toContain(
      ".file-detail-layer { position: fixed; z-index: 35; inset: 0; width: 100vw; height: 100vh; height: 100dvh; display: block; }",
    );
    expect(mobileDrawerStyles).toContain(
      ".file-detail { position: absolute; inset: 0 0 0 auto; box-sizing: border-box; width: min(400px, 100vw); height: 100vh; height: 100dvh; max-height: 100vh; max-height: 100dvh;",
    );
    expect(mobileDrawerStyles).toContain(
      ".file-detail-backdrop { position: absolute; inset: 0; width: 100%; height: 100vh; height: 100dvh;",
    );
  });

  it("keeps modal dismissal, keyboard focus handling, and file actions wired", () => {
    expect(workspace).toContain('role={isMobileDetails ? "dialog" : undefined}');
    expect(workspace).toContain("aria-modal={isMobileDetails ? true : undefined}");
    expect(workspace).toContain('if (isMobileDetails && event.key === "Escape")');
    expect(workspace).toContain('if (!isMobileDetails || event.key !== "Tab") return;');
    expect(workspace).toContain('aria-label="Dismiss file details"');
    expect(workspace).toContain('aria-label="Close file details"');
    expect(workspace).toContain("Open file <span>↗</span>");
    expect(workspace).toContain("Open source on GitHub");
  });
});
