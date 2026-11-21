const DESMOS_API = "https://www.desmos.com/api/v1.11.4/calculator.js";
const desmosLoads = new Map();

function chapterData(root) {
  const block = root.querySelector("script[data-chapter-data]");
  if (!block) throw new Error("The fragment is missing its chapter data block.");
  const data = JSON.parse(block.textContent || "{}");
  if (!data || typeof data !== "object") throw new Error("The chapter data block is invalid.");
  return data;
}

function showFeatureError(container, error) {
  if (container.querySelector(":scope > .reader-feature-error")) return;
  const message = document.createElement("span");
  message.className = "reader-feature-error";
  message.setAttribute("role", "alert");
  message.textContent = error instanceof Error
    ? `This feature could not be loaded: ${error.message}`
    : `This feature could not be loaded: ${String(error)}`;
  container.append(message);
}

function protectFeature(container, action) {
  return (...args) => {
    try {
      return action(...args);
    } catch (error) {
      console.error("Compiled reader feature failed", error);
      showFeatureError(container, error);
    }
  };
}

function attachFeature(container, action) {
  try {
    action();
  } catch (error) {
    console.error("Compiled reader feature could not be initialized", error);
    showFeatureError(container, error);
  }
}

function targetHeading(root, sectionId) {
  return [...root.querySelectorAll(
    "h1[data-section-id],h2[data-section-id],h3[data-section-id],h4[data-section-id],h5[data-section-id],h6[data-section-id]",
  )].find(
    (element) => element.dataset.sectionId === sectionId,
  );
}

function scrollToHeading(root, sectionId) {
  const heading = targetHeading(root, sectionId);
  if (!heading) return;
  heading.scrollIntoView({ behavior: "smooth", block: "start" });
  if (heading.id) history.replaceState(null, "", `#${encodeURIComponent(heading.id)}`);
}

function makePageOutline(root, data) {
  if (root.querySelector("[data-outline]")) return null;
  const entries = Array.isArray(data.outline) ? data.outline : [];
  const nav = document.createElement("nav");
  nav.className = "reader-outline";
  nav.dataset.outline = "";
  nav.setAttribute("aria-label", "Document outline");
  const heading = document.createElement("h2");
  heading.textContent = "Contents";
  nav.append(heading);
  const list = document.createElement("ol");
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || typeof entry.title !== "string") continue;
    const item = document.createElement("li");
    const link = document.createElement("a");
    const section = targetHeading(root, entry.id);
    link.href = section?.id ? `#${encodeURIComponent(section.id)}` : "#";
    link.textContent = entry.title;
    link.dataset.sectionId = entry.id;
    link.style.setProperty("--outline-level", String(Math.max(0, Number(entry.level || 1) - 1)));
    if (entry.brief) link.title = entry.brief;
    item.append(link);
    list.append(item);
  }
  nav.append(list);
  return nav;
}

function activateGlossary(root, data, cleanups) {
  const entries = data.glossary && typeof data.glossary === "object" ? data.glossary : {};
  const hide = () => {
    for (const popover of root.querySelectorAll(".chapter-glossary-popover")) popover.remove();
    for (const button of root.querySelectorAll(".chapter-glossary-reference[aria-expanded='true']")) {
      button.setAttribute("aria-expanded", "false");
    }
  };
  const click = (event) => {
    const button = event.target.closest(".chapter-glossary-reference");
    if (!button || !root.contains(button)) return;
    const termId = button.dataset.termId;
    const entry = entries[termId];
    if (!entry) {
      button.setAttribute("aria-invalid", "true");
      button.title = `Missing glossary entry: ${termId || "unknown"}`;
      showFeatureError(button.parentElement || root, new Error(button.title));
      return;
    }
    const existing = button.parentElement.querySelector(".chapter-glossary-popover");
    hide();
    if (existing) return;
    const popover = document.createElement("span");
    popover.className = "chapter-glossary-popover";
    popover.setAttribute("role", "tooltip");
    const term = document.createElement("strong");
    term.textContent = entry.term;
    const definition = document.createElement("span");
    definition.textContent = entry.definition;
    popover.append(term, definition);
    button.parentElement.append(popover);
    button.setAttribute("aria-expanded", "true");
  };
  const scroll = () => hide();
  const guardedClick = protectFeature(root, click);
  const guardedScroll = protectFeature(root, scroll);
  root.addEventListener("click", guardedClick);
  window.addEventListener("scroll", guardedScroll, true);
  cleanups.push(() => {
    root.removeEventListener("click", guardedClick);
    window.removeEventListener("scroll", guardedScroll, true);
  });
}

function attachChapterLayout(root, cleanups) {
  const outline = root.querySelector("[data-outline]");
  const notes = root.querySelector("[data-notes]");
  const facts = root.querySelector("[data-facts]");
  const examples = root.querySelector("[data-examples]");
  if (!outline || !notes || !facts || !examples) {
    throw new Error("The chapter fragment is missing an outline, notes, facts, or examples region.");
  }

  const grid = document.createElement("div");
  grid.className = "chapter-reader-grid";
  const columns = document.createElement("div");
  columns.className = "chapter-reader-columns";
  columns.append(facts, notes, outline);
  grid.append(columns);
  root.append(grid, examples);

  const tabs = document.createElement("nav");
  tabs.className = "chapter-reader-mobile-tabs";
  tabs.setAttribute("aria-label", "Chapter sections");
  const panes = [
    ["notes", "Notes"],
    ["facts", "Facts"],
    ["outline", "Outline"],
    ["examples", "Examples"],
  ];
  for (const [pane, label] of panes) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.readerPane = pane;
    button.textContent = label;
    button.setAttribute("aria-pressed", pane === "notes" ? "true" : "false");
    tabs.append(button);
  }
  root.prepend(tabs);

  const setPane = (pane) => {
    root.dataset.activePane = pane;
    for (const button of tabs.querySelectorAll("[data-reader-pane]")) {
      button.setAttribute("aria-pressed", String(button.dataset.readerPane === pane));
    }
  };
  const tabClick = (event) => {
    const button = event.target.closest("[data-reader-pane]");
    if (button) setPane(button.dataset.readerPane);
  };
  const guardedTabClick = protectFeature(tabs, tabClick);
  tabs.addEventListener("click", guardedTabClick);
  setPane("notes");
  cleanups.push(() => tabs.removeEventListener("click", guardedTabClick));

  const factsList = [...facts.querySelectorAll(".chapter-reader-fact")];
  let activeFact;
  let transitionTimer = 0;
  let transitionFrame = 0;
  for (const fact of factsList) fact.hidden = true;

  const updateFacts = (sectionId) => {
    let active = factsList.find((fact) => fact.dataset.sectionId === sectionId);
    if (!active && sectionId.startsWith("SECTION-")) {
      const number = sectionId.slice("SECTION-".length);
      active = factsList.find((fact) => fact.dataset.sectionId.startsWith(`${number}.`));
    }
    if (activeFact === active) return;
    if (transitionTimer) window.clearTimeout(transitionTimer);
    if (transitionFrame) window.cancelAnimationFrame(transitionFrame);
    const previous = activeFact;
    for (const fact of factsList) {
      if (fact !== previous && fact !== active) {
        fact.hidden = true;
        fact.classList.remove("is-leaving", "is-entering");
      }
    }
    activeFact = active;
    facts.dataset.activeSection = active?.dataset.sectionId || "";
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    if (previous) {
      previous.classList.remove("is-entering");
      previous.classList.add("is-leaving");
    }
    if (active) {
      active.hidden = false;
      active.classList.remove("is-leaving");
      if (duration > 0) {
        active.classList.add("is-entering");
        transitionFrame = window.requestAnimationFrame(() => {
          transitionFrame = 0;
          active.classList.remove("is-entering");
        });
      }
    }
    if (previous) {
      if (duration === 0) {
        previous.hidden = true;
        previous.classList.remove("is-leaving");
      } else {
        transitionTimer = window.setTimeout(() => {
          transitionTimer = 0;
          previous.hidden = true;
          previous.classList.remove("is-leaving");
        }, duration);
      }
    }
  };

  const observeSections = protectFeature(facts, (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
    const sectionId = visible?.target.dataset.sectionId;
    if (!sectionId) return;
    updateFacts(sectionId);
    for (const link of outline.querySelectorAll("a[data-section-id]")) {
      link.classList.toggle("is-active", link.dataset.sectionId === sectionId);
    }
  });
  const observer = new IntersectionObserver(observeSections, {
    root: notes,
    rootMargin: "-15% 0px -70% 0px",
    threshold: 0,
  });
  for (const heading of notes.querySelectorAll("[data-section-id]")) observer.observe(heading);
  cleanups.push(() => observer.disconnect());
  cleanups.push(() => {
    if (transitionTimer) window.clearTimeout(transitionTimer);
    if (transitionFrame) window.cancelAnimationFrame(transitionFrame);
  });

  const navigate = (event) => {
    const link = event.target.closest("[data-section-id]");
    if (link && outline.contains(link)) {
      event.preventDefault();
      scrollToHeading(root, link.dataset.sectionId);
      setPane("notes");
      return;
    }
    const example = event.target.closest("[data-example-target]");
    if (example && root.contains(example)) {
      const card = [...examples.querySelectorAll("[data-example-id]")].find(
        (item) => item.dataset.exampleId === example.dataset.exampleTarget,
      );
      if (card) {
        setPane("examples");
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    const back = event.target.closest("[data-return-section]");
    if (back && root.contains(back)) {
      event.preventDefault();
      setPane("notes");
      scrollToHeading(root, back.dataset.returnSection);
    }
  };
  const guardedNavigate = protectFeature(root, navigate);
  root.addEventListener("click", guardedNavigate);
  cleanups.push(() => root.removeEventListener("click", guardedNavigate));
  protectFeature(facts, () => {
    updateFacts(notes.querySelector("[data-section-id]")?.dataset.sectionId || "");
  })();
}

function openDiagram(root, svg, title, cleanups) {
  const dialog = document.createElement("dialog");
  dialog.className = "reader-diagram-dialog";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close diagram");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const content = document.createElement("div");
  content.className = "reader-diagram-dialog-content";
  content.append(svg.cloneNode(true));
  dialog.append(close, heading, content);
  root.append(dialog);
  const dismiss = () => dialog.close();
  close.addEventListener("click", dismiss);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dismiss();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  cleanups.push(() => {
    if (dialog.open) dialog.close();
    dialog.remove();
  });
}

function attachDiagrams(root, cleanups) {
  for (const figure of root.querySelectorAll("figure[data-diagram]")) {
    const svg = figure.querySelector("svg");
    if (!svg || figure.querySelector("[data-open-diagram]")) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.openDiagram = "";
    button.textContent = "Expand diagram";
    button.addEventListener("click", () => {
      try {
        openDiagram(root, svg, figure.dataset.diagramKind || "Diagram", cleanups);
      } catch (error) {
        figure.dataset.error = error instanceof Error ? error.message : String(error);
        showFeatureError(figure, error);
      }
    });
    figure.append(button);
  }
}

function loadDesmos(apiKey) {
  const existing = desmosLoads.get(apiKey);
  if (existing) return existing;
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${DESMOS_API}?apiKey=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      desmosLoads.delete(apiKey);
      reject(new Error("Unable to load Desmos. Check the local API key and network connection."));
    };
    document.head.append(script);
  });
  desmosLoads.set(apiKey, promise);
  return promise;
}

function showDesmosError(host, error) {
  const message = document.createElement("p");
  message.className = "reader-feature-error";
  message.setAttribute("role", "alert");
  message.textContent = error instanceof Error ? error.message : String(error);
  host.replaceChildren(message);
}

function attachDesmos(root, apiKey, cleanups) {
  for (const block of root.querySelectorAll("[data-desmos]")) {
    const request = block.querySelector("script[data-desmos-request]");
    if (!request) throw new Error(`Desmos block ${block.dataset.id || "(unknown)"} has no request data.`);
    const load = document.createElement("button");
    load.type = "button";
    load.className = "reader-desmos-load";
    load.textContent = "Load Desmos graph";
    const host = document.createElement("div");
    host.className = "reader-desmos-host";
    host.hidden = true;
    const error = document.createElement("div");
    error.className = "reader-desmos-error";
    block.append(load, host, error);
    let calculator;
    const click = async () => {
      load.disabled = true;
      error.replaceChildren();
      try {
        if (!apiKey) throw new Error("Set DESMOS_API_KEY in .env.local to load graphs.");
        await loadDesmos(apiKey);
        const api = window.Desmos;
        if (!api) throw new Error("The Desmos API did not initialize.");
        const data = JSON.parse(request.textContent || "{}");
        if (!Array.isArray(data.expressions)) throw new Error("Desmos request has no expressions.");
        host.hidden = false;
        const constructor = block.dataset.kind === "3d" ? api.Calculator3D : api.GraphingCalculator;
        if (typeof constructor !== "function") throw new Error(`Desmos ${block.dataset.kind} calculator is unavailable.`);
        if (block.dataset.kind === "3d") {
          const canvas = document.createElement("canvas");
          if (!canvas.getContext("webgl2") && !canvas.getContext("webgl")) {
            throw new Error("Desmos 3D needs WebGL, which is unavailable in this browser.");
          }
        }
        const options = Object.fromEntries(
          Object.entries(data.options || {}).filter(([, value]) => typeof value === "boolean"),
        );
        calculator = constructor(host, {
          ...options,
          invertedColors: document.documentElement.dataset.mode !== "light",
          expressions: false,
          settingsMenu: false,
          zoomButtons: true,
        });
        calculator.setExpressions(data.expressions.map((expression) => ({ ...expression, readonly: true })));
        if (data.settings) calculator.updateSettings(data.settings);
        if (data.bounds) calculator.setMathBounds(data.bounds);
        if (data.camera) calculator.setCamera(data.camera);
        load.remove();
      } catch (cause) {
        calculator?.destroy?.();
        calculator = undefined;
        showDesmosError(error, cause);
        load.disabled = false;
      }
    };
    load.addEventListener("click", click);
    cleanups.push(() => {
      load.removeEventListener("click", click);
      calculator?.destroy?.();
    });
  }
}

export function attachChapterReader(root, options = {}) {
  if (!(root instanceof HTMLElement)) throw new TypeError("A chapter fragment element is required.");
  if (root.dataset.readerAttached === "true") throw new Error("This fragment already has the reader attached.");
  const version = root.dataset.rendererVersion || "";
  if (!version.startsWith("0.2.")) throw new Error(`Unsupported renderer version "${version}".`);
  const data = chapterData(root);
  const cleanups = [];
  root.dataset.readerAttached = "true";
  cleanups.push(() => {
    for (const message of root.querySelectorAll(".reader-feature-error")) message.remove();
  });
  try {
    if (root.dataset.kind === "chapter") {
      attachFeature(root, () => attachChapterLayout(root, cleanups));
      attachFeature(root, () => activateGlossary(root, data, cleanups));
      attachFeature(root, () => attachDiagrams(root, cleanups));
      attachFeature(root, () => attachDesmos(root, options.desmosApiKey || "", cleanups));
    } else {
      attachFeature(root, () => {
        const outline = makePageOutline(root, data);
        if (!outline) return;
        const content = root.querySelector("[data-content]");
        const layout = document.createElement("div");
        layout.className = "page-reader-layout";
        layout.append(outline);
        if (content) layout.append(content);
        root.append(layout);
      });
    }
  } catch (error) {
    root.dataset.readerAttached = "false";
    for (const cleanup of cleanups.reverse()) cleanup();
    throw error;
  }
  return () => {
    root.dataset.readerAttached = "false";
    for (const cleanup of cleanups.reverse()) cleanup();
  };
}
