import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../src/app/page";
import LandingThreeHero from "../src/components/landing-three-hero";

const harness = vi.hoisted(() => ({
  effect: null as (() => void | (() => void)) | null,
  canvas: null as HTMLCanvasElement | null,
  sceneState: "static",
  mobile: false,
  reducedMotion: false,
  intersectionCallback: null as IntersectionObserverCallback | null,
  pendingTimers: new Map<number, () => void>(),
  nextTimerId: 0,
  windowListeners: new Map<string, Set<EventListener>>(),
  canvasListeners: new Map<string, Set<EventListener>>(),
  mediaListeners: new Map<string, Set<(event: MediaQueryListEvent) => void>>(),
  resizeObserverDisconnected: 0,
  intersectionObserverDisconnected: 0,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (callback: () => void | (() => void)) => {
      harness.effect = callback;
    },
    useRef: () => ({ current: harness.canvas }),
    useState: (initial: string) => [
      harness.sceneState || initial,
      (next: string) => {
        harness.sceneState = next;
      },
    ],
  };
});

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function installBrowserGlobals() {
  const previous = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    intersectionObserver: Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver"),
    resizeObserver: Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"),
  };

  const mediaQueries = new Map<string, Set<(event: MediaQueryListEvent) => void>>();
  const canvasListeners = new Map<string, Set<EventListener>>();
  const windowListeners = new Map<string, Set<EventListener>>();
  const addListener = (listeners: Map<string, Set<EventListener>>, type: string, callback: EventListener) => {
    const callbacks = listeners.get(type) ?? new Set<EventListener>();
    callbacks.add(callback);
    listeners.set(type, callbacks);
  };
  const removeListener = (listeners: Map<string, Set<EventListener>>, type: string, callback: EventListener) => {
    listeners.get(type)?.delete(callback);
  };

  harness.pendingTimers = new Map();
  harness.nextTimerId = 0;
  harness.windowListeners = windowListeners;
  harness.canvasListeners = canvasListeners;
  harness.mediaListeners = mediaQueries;
  harness.intersectionCallback = null;
  harness.resizeObserverDisconnected = 0;
  harness.intersectionObserverDisconnected = 0;

  const canvas = {
    clientWidth: 640,
    clientHeight: 420,
    parentElement: {},
    addEventListener: (type: string, callback: EventListener) => addListener(canvasListeners, type, callback),
    removeEventListener: (type: string, callback: EventListener) => removeListener(canvasListeners, type, callback),
  } as unknown as HTMLCanvasElement;
  harness.canvas = canvas;

  class FakeIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      harness.intersectionCallback = callback;
    }

    observe() {}

    disconnect() {
      harness.intersectionObserverDisconnected += 1;
    }
  }

  class FakeResizeObserver {
    constructor() {}

    observe() {}

    disconnect() {
      harness.resizeObserverDisconnected += 1;
    }
  }

  const browserWindow = {
    devicePixelRatio: 1,
    matchMedia: (query: string) => {
      const callbacks = mediaQueries.get(query) ?? new Set<(event: MediaQueryListEvent) => void>();
      mediaQueries.set(query, callbacks);
      return {
        matches: query.includes("prefers-reduced-motion")
          ? harness.reducedMotion
          : harness.mobile,
        addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => callbacks.add(callback),
        removeEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => callbacks.delete(callback),
      };
    },
    addEventListener: (type: string, callback: EventListener) => addListener(windowListeners, type, callback),
    removeEventListener: (type: string, callback: EventListener) => removeListener(windowListeners, type, callback),
    setTimeout: (callback: () => void) => {
      const id = ++harness.nextTimerId;
      harness.pendingTimers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => {
      harness.pendingTimers.delete(id);
    },
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: FakeIntersectionObserver,
  });
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: FakeResizeObserver });

  return () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      const globalKey = key === "intersectionObserver"
        ? "IntersectionObserver"
        : key === "resizeObserver"
          ? "ResizeObserver"
          : key;
      if (descriptor) Object.defineProperty(globalThis, globalKey, descriptor);
      else Reflect.deleteProperty(globalThis, globalKey);
    }
  };
}

function renderHero() {
  return renderToStaticMarkup(createElement(LandingThreeHero));
}

function mountHeroEffect() {
  renderHero();
  if (!harness.effect) throw new Error("Landing hero effect was not captured");
  return harness.effect();
}

async function enterViewport() {
  harness.intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
}

describe("landing Three.js hero", () => {
  let restoreBrowserGlobals: (() => void) | undefined;

  beforeEach(() => {
    harness.sceneState = "static";
    harness.mobile = false;
    harness.reducedMotion = false;
    harness.effect = null;
    restoreBrowserGlobals = installBrowserGlobals();
  });

  afterEach(() => {
    restoreBrowserGlobals?.();
    restoreBrowserGlobals = undefined;
  });

  it("server-renders the landing headline, navigation, actions, and accessible static folio", () => {
    const markup = renderToStaticMarkup(createElement(HomePage));

    expect(markup).toContain('<h1 id="landing-title">Make room for <em>understanding.</em></h1>');
    expect(markup).toContain('<nav class="');
    expect(markup).toContain('aria-label="Main navigation"');
    expect(markup).toContain('href="/lowersecondary"');
    expect(markup).toContain("Explore the library");
    expect(markup).toContain('aria-labelledby="folio-caption"');
    expect(markup).toContain('aria-hidden="true"></canvas>');
    expect(markup).toContain("An open folio brings connected ideas into view");
    expect(markup).toContain("FIELD NOTES");
    expect(markup).toContain("IDEAS");
  });

  it("keeps Three.js outside the stream's static route imports and waits for the hero to enter view", () => {
    const heroSource = source("../src/components/landing-three-hero.tsx");
    const streamRoute = source("../src/app/[stream]/page.tsx");
    const sharedWorkspace = source("../src/components/notebook-workspace.tsx");

    expect(heroSource).not.toMatch(/^\s*import\s+(?!type\b).*?\bfrom\s*["']three["']/m);
    expect(heroSource).toContain('await import("three")');
    expect(streamRoute).not.toContain("LandingThreeHero");
    expect(sharedWorkspace).not.toContain("LandingThreeHero");

    const cleanup = mountHeroEffect();
    expect(harness.intersectionCallback).not.toBeNull();
    expect(harness.pendingTimers.size).toBe(0);

    harness.intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(harness.pendingTimers.size).toBe(0);

    enterViewport();
    expect(harness.pendingTimers.size).toBe(1);
    expect(harness.sceneState).toBe("static");

    cleanup?.();
    expect(harness.pendingTimers.size).toBe(0);
    expect(harness.intersectionObserverDisconnected).toBeGreaterThan(0);
  });

  it.each([
    ["mobile viewport", true, false],
    ["reduced motion", false, true],
  ])("keeps the static folio and skips scene startup for %s", (preference, mobile, reducedMotion) => {
    harness.mobile = mobile;
    harness.reducedMotion = reducedMotion;
    const cleanup = mountHeroEffect();

    expect(harness.intersectionCallback).toBeNull();
    expect(harness.pendingTimers.size).toBe(0);
    expect(harness.sceneState).toBe("static");
    const markup = renderHero();
    expect(markup).toContain("FIELD NOTES");
    expect(markup).toContain("IDEAS");
    expect(markup).not.toContain("Loading the optional interactive folio");
    cleanup?.();
    expect(harness.mediaListeners.get("(max-width: 720px), (max-height: 500px) and (pointer: coarse)")?.size).toBe(0);
    expect(harness.mediaListeners.get("(prefers-reduced-motion: reduce)")?.size).toBe(0);
  });

  it("renders a useful accessible fallback when scene initialization or WebGL fails", () => {
    const heroSource = source("../src/components/landing-three-hero.tsx");
    harness.sceneState = "failed";
    const markup = renderHero();
    expect(markup).toContain('role="status"');
    expect(markup).toContain("The interactive folio is unavailable; the static diagram remains.");
    expect(markup).toContain("FIELD NOTES");
    expect(markup).toContain("IDEAS");

    expect(heroSource).toMatch(/catch\s*\{[\s\S]*?failScene\(\);/);
    expect(heroSource).toContain('new THREE.WebGLRenderer');
    expect(heroSource).toContain('setSceneState("failed")');
  });

  it("prevents default on context loss and releases scene resources and listeners", () => {
    const heroSource = source("../src/components/landing-three-hero.tsx");

    expect(heroSource).toContain('event.preventDefault();');
    expect(heroSource).toContain('onContextLoss();');
    expect(heroSource).toContain('canvas.addEventListener("webglcontextlost", contextLostHandler)');
    expect(heroSource).toContain('canvas.removeEventListener("webglcontextlost", contextLostHandler)');
    expect(heroSource).toContain('window.removeEventListener("resize", handleResize)');
    expect(heroSource).toContain('resizeObserver?.disconnect()');
    expect(heroSource).toContain('renderer.setAnimationLoop(null)');
    expect(heroSource).toContain('renderer.dispose()');
    expect(heroSource).toContain('renderer.forceContextLoss()');
    expect(heroSource).toContain('geometries.forEach((geometry) => geometry.dispose())');
    expect(heroSource).toContain('materials.forEach((material) => material.dispose())');
    expect(heroSource).toContain('mobileViewport.removeEventListener("change", handlePreferenceChange)');
    expect(heroSource).toContain('reducedMotion.removeEventListener("change", handlePreferenceChange)');
  });
});
