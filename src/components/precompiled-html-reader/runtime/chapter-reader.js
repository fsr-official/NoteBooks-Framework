import { buildChapterOutline, outlineSectionId } from "./chapter-reader-outline.js";

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
      delete button.dataset.glossaryOpenedBy;
    }
  };
  const show = (button, source) => {
    const termId = button.dataset.termId;
    const entry = entries[termId];
    if (!entry) {
      button.setAttribute("aria-invalid", "true");
      button.title = `Missing glossary entry: ${termId || "unknown"}`;
      showFeatureError(button.parentElement || root, new Error(button.title));
      return;
    }
    const existing = button.parentElement.querySelector(".chapter-glossary-popover");
    if (existing) return;
    hide();
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
    button.dataset.glossaryOpenedBy = source;
  };
  const click = (event) => {
    const button = event.target.closest(".chapter-glossary-reference");
    if (!button || !root.contains(button)) return;
    const existing = button.parentElement.querySelector(".chapter-glossary-popover");
    if (existing && button.dataset.glossaryOpenedBy === "hover") {
      button.dataset.glossaryOpenedBy = "click";
      return;
    }
    if (existing) {
      hide();
      return;
    }
    show(button, "click");
  };
  const pointerOver = (event) => {
    if (event.pointerType === "touch") return;
    const button = event.target.closest(".chapter-glossary-reference");
    if (!button || !root.contains(button) || button.contains(event.relatedTarget)) return;
    show(button, "hover");
  };
  const pointerOut = (event) => {
    if (event.pointerType === "touch") return;
    const button = event.target.closest(".chapter-glossary-reference");
    if (!button || !root.contains(button) || button.dataset.glossaryOpenedBy !== "hover") return;
    if (button.parentElement.contains(event.relatedTarget)) return;
    hide();
  };
  const scroll = () => hide();
  const guardedClick = protectFeature(root, click);
  const guardedPointerOver = protectFeature(root, pointerOver);
  const guardedPointerOut = protectFeature(root, pointerOut);
  const guardedScroll = protectFeature(root, scroll);
  root.addEventListener("click", guardedClick);
  root.addEventListener("pointerover", guardedPointerOver);
  root.addEventListener("pointerout", guardedPointerOut);
  window.addEventListener("scroll", guardedScroll, true);
  cleanups.push(() => {
    root.removeEventListener("click", guardedClick);
    root.removeEventListener("pointerover", guardedPointerOver);
    root.removeEventListener("pointerout", guardedPointerOut);
    window.removeEventListener("scroll", guardedScroll, true);
  });
}

function attachChapterLayout(root, cleanups) {
  const outline = root.querySelector("[data-outline]");
  const notes = root.querySelector("[data-notes]");
  const facts = root.querySelector("[data-facts]");
  const examples = root.querySelector("[data-examples]");
  if (!outline || !notes || !facts) {
    throw new Error("The chapter fragment is missing its outline, notes, or CNOTES region.");
  }

  const originalRootId = root.id;
  const originalActivePane = root.dataset.activePane;
  const readerId = root.id || "precompiled-html-chapter-reader";
  if (!root.id) root.id = readerId;
  const originalOutlineHtml = outline.innerHTML;
  const originalActiveFact = facts.dataset.activeSection;
  const chapterHeading = root.querySelector("[data-chapter-title]");
  const originalChapterHeadingParent = chapterHeading?.parentNode;
  const originalChapterHeadingNextSibling = chapterHeading?.nextSibling;
  const notesDocumentHeading = notes.querySelector(":scope > h1");
  const outlineHeading = outline.querySelector(":scope > h2");
  const chapterBriefHeading = facts.querySelector(".chapter-reader-overview h2");
  const originalChapterBriefHeadingHtml = chapterBriefHeading?.innerHTML;
  const panelAttributeNames = ["id", "role", "aria-labelledby", "tabindex", "data-reader-panel"];
  const originalPanelAttributes = new Map(
    [notes, facts].map((panel) => [
      panel,
      Object.fromEntries(panelAttributeNames.map((name) => [name, panel.getAttribute(name)])),
    ]),
  );
  const exampleLinks = [...notes.querySelectorAll(".chapter-example-links")].map((element) => ({
    element,
    parent: element.parentNode,
    nextSibling: element.nextSibling,
  }));
  const entries = [...outline.querySelectorAll("a[data-section-id]")].map((link) => ({
    id: link.dataset.sectionId,
    title: link.textContent?.trim() || link.dataset.sectionId,
    importance: link.closest("li")?.dataset.importance,
  }));
  const headings = [...notes.querySelectorAll("h1[data-section-id],h2[data-section-id],h3[data-section-id],h4[data-section-id]")]
    .map((heading) => ({
      id: heading.dataset.sectionId,
      title: heading.textContent?.trim() || heading.dataset.sectionId,
      depth: Number(heading.tagName.slice(1)),
    }))
    .filter((heading) => heading.id && heading.title);
  const outlineModel = buildChapterOutline(entries, headings);

  if (outlineHeading) outlineHeading.textContent = "Chapter Outline";

  const outlinePanel = document.createElement("section");
  outlinePanel.className = "chapter-reader-outline-pane";
  outlinePanel.dataset.readerPanel = "outline";
  outlinePanel.id = `${readerId}-outline-pane`;
  outlinePanel.setAttribute("role", "tabpanel");
  outlinePanel.setAttribute("aria-labelledby", `${readerId}-outline-tab`);
  outlinePanel.tabIndex = 0;
  outlinePanel.append(outline);

  const topicHeader = document.createElement("header");
  topicHeader.className = "chapter-reader-topic-heading";
  if (chapterHeading) {
    chapterHeading.classList.add("chapter-reader-flow-heading");
    topicHeader.append(chapterHeading);
  }
  notesDocumentHeading?.remove();

  const conceptsTitle = document.createElement("h2");
  conceptsTitle.className = "chapter-reader-pane-title";
  conceptsTitle.textContent = "Concepts";
  notes.prepend(conceptsTitle);
  notes.id = `${readerId}-concepts-pane`;
  notes.dataset.readerPanel = "concepts";
  notes.setAttribute("role", "tabpanel");
  notes.setAttribute("aria-labelledby", `${readerId}-concepts-tab`);
  notes.tabIndex = 0;

  const factsTitle = document.createElement("h2");
  factsTitle.className = "chapter-reader-pane-title";
  factsTitle.textContent = "Important Facts";
  facts.prepend(factsTitle);
  facts.id = `${readerId}-facts-pane`;
  facts.dataset.readerPanel = "facts";
  facts.setAttribute("role", "tabpanel");
  facts.setAttribute("aria-labelledby", `${readerId}-facts-tab`);
  facts.tabIndex = 0;

  for (const { element } of exampleLinks) element.remove();
  examples?.remove();

  const grid = document.createElement("div");
  grid.className = "precompiled-chapter-grid";
  const columns = document.createElement("div");
  columns.className = "chapter-reader-columns";
  const readingArea = document.createElement("div");
  readingArea.className = "chapter-reader-reading-area";
  const contentColumns = document.createElement("div");
  contentColumns.className = "chapter-reader-content-columns";
  contentColumns.append(notes, facts);
  columns.append(outlinePanel, readingArea);
  const bindingSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  bindingSvg.classList.add("chapter-reader-binding-lines");
  bindingSvg.setAttribute("aria-hidden", "true");
  bindingSvg.setAttribute("focusable", "false");
  const bindingPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  bindingPath.dataset.readerBindingLine = "";
  bindingSvg.append(bindingPath);
  columns.append(bindingSvg);
  grid.append(columns);
  root.append(grid);

  const outlineList = outline.querySelector("ol");
  if (!outlineList) throw new Error("The chapter outline is missing its list.");
  outlineList.replaceChildren();
  for (const item of outlineModel) {
    const listItem = document.createElement("li");
    listItem.className = "chapter-reader-outline-group";
    listItem.dataset.outlineGroup = item.id;
    if (item.importance) listItem.dataset.importance = item.importance;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-reader-outline-button";
    button.textContent = item.title;
    button.dataset.sectionId = item.id;
    if (item.kind === "section") {
      button.dataset.mainSection = "";
      if (item.importance) button.dataset.importance = item.importance;
    }
    listItem.append(button);

    if (item.children.length) {
      const subsections = document.createElement("ol");
      subsections.className = "chapter-reader-outline-subsections";
      for (const subsection of item.children) {
        const childItem = document.createElement("li");
        const childButton = document.createElement("button");
        childButton.type = "button";
        childButton.className = "chapter-reader-outline-button";
        childButton.dataset.sectionId = subsection.id;
        childButton.dataset.subsection = "";
        childButton.style.setProperty("--outline-depth", String(Math.max(0, subsection.depth - 3)));
        childButton.textContent = subsection.title;
        childItem.append(childButton);
        subsections.append(childItem);
      }
      subsections.hidden = true;
      listItem.append(subsections);
    }
    outlineList.append(listItem);
  }

  const chapterTitle = chapterHeading?.textContent?.trim();
  if (chapterTitle && chapterBriefHeading) {
    chapterBriefHeading.textContent = `${chapterBriefHeading.textContent?.trim()}:`;
    const title = document.createElement("span");
    title.className = "chapter-reader-overview-title";
    title.textContent = chapterTitle;
    chapterBriefHeading.after(title);
  }

  const factsList = [...facts.querySelectorAll(".chapter-reader-fact:not(.chapter-reader-overview)")];
  const originalFactHidden = factsList.map((fact) => fact.hidden);
  for (const fact of factsList) {
    const sectionId = fact.dataset.sectionId;
    if (!sectionId || sectionId === "chapter-overview") continue;
    const heading = targetHeading(root, sectionId);
    const title = fact.querySelector("h2");
    if (!heading || !title) continue;
    title.replaceChildren(...[...heading.childNodes].map((node) => node.cloneNode(true)));
    title.classList.add("chapter-reader-fact-title");
  }

  const tabs = document.createElement("nav");
  tabs.className = "chapter-reader-mobile-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Reader sections");
  tabs.setAttribute("aria-orientation", "horizontal");
  const panes = [
    ["outline", "Outline"],
    ["concepts", "Concepts"],
    ["facts", "Facts"],
  ];
  for (const [pane, label] of panes) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `${readerId}-${pane}-tab`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `${readerId}-${pane}-pane`);
    button.dataset.readerPane = pane;
    button.textContent = label;
    button.setAttribute("aria-selected", "false");
    button.tabIndex = -1;
    tabs.append(button);
  }
  readingArea.append(topicHeader, tabs, contentColumns);

  const setPane = (pane) => {
    if (!panes.some(([name]) => name === pane)) return;
    root.dataset.activePane = pane;
    for (const button of tabs.querySelectorAll("[data-reader-pane]")) {
      const selected = button.dataset.readerPane === pane;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  };
  const tabClick = (event) => {
    const button = event.target.closest("[data-reader-pane]");
    if (button) {
      setPane(button.dataset.readerPane);
      scheduleBinding();
    }
  };
  const tabKeydown = (event) => {
    const currentButton = event.target.closest("[data-reader-pane]");
    if (!currentButton) return;
    const index = panes.findIndex(([pane]) => pane === currentButton.dataset.readerPane);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % panes.length;
    else if (event.key === "ArrowLeft") nextIndex = (index + panes.length - 1) % panes.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = panes.length - 1;
    else return;
    event.preventDefault();
    const [nextPane] = panes[nextIndex];
    setPane(nextPane);
    tabs.querySelector(`[data-reader-pane="${nextPane}"]`)?.focus();
    scheduleBinding();
  };
  const guardedTabClick = protectFeature(tabs, tabClick);
  const guardedTabKeydown = protectFeature(tabs, tabKeydown);
  tabs.addEventListener("click", guardedTabClick);
  tabs.addEventListener("keydown", guardedTabKeydown);
  setPane("concepts");
  cleanups.push(() => {
    tabs.removeEventListener("click", guardedTabClick);
    tabs.removeEventListener("keydown", guardedTabKeydown);
  });

  let activeFact;
  let pendingSectionId = "";
  let pendingSectionTimer = 0;
  let scheduleBinding = () => {};
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

  let bindingFrame = 0;
  const drawBinding = () => {
    bindingFrame = 0;
    const bounds = columns.getBoundingClientRect();
    bindingSvg.setAttribute("viewBox", `0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`);
    const flowHeaders = [
      outline.querySelector(":scope > h2"),
      chapterHeading,
      conceptsTitle,
    ];
    if (!bounds.width || !bounds.height || flowHeaders.some((header) => !header)) {
      bindingPath.setAttribute("d", "");
      return;
    }

    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left - bounds.left,
        right: box.right - bounds.left,
        top: box.top - bounds.top,
        centerY: box.top + box.height / 2 - bounds.top,
      };
    };
    const [outlineBox, headingBox, briefBox] = flowHeaders.map(rect);
    const lineY = (outlineBox.centerY + headingBox.centerY + briefBox.centerY) / 3;
    const values = [outlineBox.right, headingBox.left, headingBox.right, briefBox.left, lineY];
    if (values.some((value) => !Number.isFinite(value))) {
      bindingPath.setAttribute("d", "");
      return;
    }
    const format = (value) => Number(value.toFixed(1));
    const d = [
      `M ${format(outlineBox.right)} ${format(lineY)}`,
      `H ${format(headingBox.left)}`,
      `M ${format(headingBox.right)} ${format(lineY)}`,
      `H ${format(briefBox.left)}`,
    ].join(" ");
    bindingPath.setAttribute("d", d);
  };
  scheduleBinding = () => {
    if (bindingFrame) return;
    bindingFrame = window.requestAnimationFrame(drawBinding);
  };

  const updateActiveSection = (sectionId) => {
    const mainSectionId = outlineSectionId(sectionId);
    if (!mainSectionId) return;
    root.dataset.activeSection = sectionId;
    root.dataset.activeMainSection = mainSectionId;

    for (const group of outline.querySelectorAll("[data-outline-group]")) {
      const expanded = group.dataset.outlineGroup === mainSectionId;
      group.classList.toggle("is-active", expanded);
      const mainButton = group.querySelector(":scope > .chapter-reader-outline-button");
      const subsectionList = group.querySelector(":scope > .chapter-reader-outline-subsections");
      if (mainButton) {
        mainButton.classList.toggle("is-active", expanded);
        if (subsectionList) {
          mainButton.setAttribute("aria-expanded", String(expanded));
          if (expanded) mainButton.setAttribute("aria-current", "location");
          else mainButton.removeAttribute("aria-current");
        }
      }
      if (subsectionList) subsectionList.hidden = !expanded;
    }

    for (const button of outline.querySelectorAll("button[data-section-id]")) {
      const isCurrent = button.dataset.sectionId === sectionId;
      button.classList.toggle("is-current", isCurrent);
      if (isCurrent) button.setAttribute("aria-current", "location");
      else if (!button.hasAttribute("data-main-section")) button.removeAttribute("aria-current");
    }
    for (const noteHeading of notes.querySelectorAll("h1[data-section-id],h2[data-section-id],h3[data-section-id],h4[data-section-id]")) {
      noteHeading.classList.toggle("is-bound-active", noteHeading.dataset.sectionId === sectionId);
    }

    updateFacts(sectionId);
    for (const fact of factsList) {
      fact.classList.toggle("is-bound-active", fact === activeFact);
    }

    const activeMainButton = [...outline.querySelectorAll("button[data-main-section]")]
      .find((button) => button.dataset.sectionId === mainSectionId);
    if (activeMainButton) {
      const outlineBounds = outline.getBoundingClientRect();
      const buttonBounds = activeMainButton.getBoundingClientRect();
      if (buttonBounds.top < outlineBounds.top) {
        outline.scrollTop -= outlineBounds.top - buttonBounds.top;
      } else if (buttonBounds.bottom > outlineBounds.bottom) {
        outline.scrollTop += buttonBounds.bottom - outlineBounds.bottom;
      }
    }
    scheduleBinding();
  };

  const bindingScroll = () => scheduleBinding();
  for (const column of [outline, notes, facts]) {
    column.addEventListener("scroll", bindingScroll, { passive: true });
  }
  window.addEventListener("resize", bindingScroll);
  const bindingResizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(bindingScroll);
  bindingResizeObserver?.observe(columns);
  for (const header of [outlineHeading, chapterHeading, chapterBriefHeading]) {
    if (header) bindingResizeObserver?.observe(header);
  }
  cleanups.push(() => {
    for (const column of [outline, notes, facts]) {
      column.removeEventListener("scroll", bindingScroll);
    }
    window.removeEventListener("resize", bindingScroll);
    bindingResizeObserver?.disconnect();
    if (bindingFrame) window.cancelAnimationFrame(bindingFrame);
  });

  const observeSections = protectFeature(facts, (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
    const sectionId = visible?.target.dataset.sectionId;
    if (!sectionId) return;
    if (pendingSectionId) {
      const pendingMainSection = outlineSectionId(pendingSectionId);
      const pendingIsMainSection = pendingSectionId === "chapter-overview" || /^SECTION-\d+$/.test(pendingSectionId);
      if (
        sectionId !== pendingSectionId
        && (!pendingIsMainSection || outlineSectionId(sectionId) !== pendingMainSection)
      ) return;
      pendingSectionId = "";
      window.clearTimeout(pendingSectionTimer);
      pendingSectionTimer = 0;
    }
    updateActiveSection(sectionId);
  });
  const observer = new IntersectionObserver(observeSections, {
    root: notes,
    rootMargin: "-15% 0px -70% 0px",
    threshold: 0,
  });
  for (const heading of notes.querySelectorAll("h1[data-section-id],h2[data-section-id],h3[data-section-id],h4[data-section-id]")) {
    observer.observe(heading);
  }
  cleanups.push(() => observer.disconnect());
  cleanups.push(() => {
    if (transitionTimer) window.clearTimeout(transitionTimer);
    if (transitionFrame) window.cancelAnimationFrame(transitionFrame);
    if (pendingSectionTimer) window.clearTimeout(pendingSectionTimer);
  });

  const navigate = (event) => {
    const button = event.target.closest("button[data-section-id]");
    if (button && outline.contains(button)) {
      event.preventDefault();
      pendingSectionId = button.dataset.sectionId;
      if (pendingSectionTimer) window.clearTimeout(pendingSectionTimer);
      pendingSectionTimer = window.setTimeout(() => {
        pendingSectionId = "";
        pendingSectionTimer = 0;
      }, 4000);
      updateActiveSection(button.dataset.sectionId);
      scrollToHeading(root, button.dataset.sectionId);
      setPane("concepts");
      return;
    }
  };
  const guardedNavigate = protectFeature(root, navigate);
  root.addEventListener("click", guardedNavigate);
  cleanups.push(() => root.removeEventListener("click", guardedNavigate));
  const sectionHeadings = [...notes.querySelectorAll(
    "h1[data-section-id],h2[data-section-id],h3[data-section-id],h4[data-section-id]",
  )].filter((heading) => outlineSectionId(heading.dataset.sectionId || ""));
  const initialSectionHeading = sectionHeadings.find(
    (heading) => heading.dataset.sectionId !== "chapter-overview",
  ) || sectionHeadings[0];
  updateActiveSection(initialSectionHeading?.dataset.sectionId || "");
  cleanups.push(() => {
    outline.innerHTML = originalOutlineHtml;
    if (chapterBriefHeading && originalChapterBriefHeadingHtml !== undefined) {
      chapterBriefHeading.innerHTML = originalChapterBriefHeadingHtml;
    }
    conceptsTitle.remove();
    factsTitle.remove();
    factsList.forEach((fact, index) => {
      fact.hidden = originalFactHidden[index];
      fact.classList.remove("is-bound-active");
    });
    for (const noteHeading of notes.querySelectorAll(".is-bound-active")) {
      noteHeading.classList.remove("is-bound-active");
    }
    delete root.dataset.activeSection;
    delete root.dataset.activeMainSection;
    if (originalActivePane === undefined) delete root.dataset.activePane;
    else root.dataset.activePane = originalActivePane;
    if (originalActiveFact === undefined) delete facts.dataset.activeSection;
    else facts.dataset.activeSection = originalActiveFact;
    for (const [panel, attributes] of originalPanelAttributes) {
      for (const [name, value] of Object.entries(attributes)) {
        if (value === null) panel.removeAttribute(name);
        else panel.setAttribute(name, value);
      }
    }
    if (originalRootId) root.id = originalRootId;
    else root.removeAttribute("id");
    tabs.remove();
    bindingSvg.remove();
    grid.remove();
    root.append(outline, notes, facts);
    if (notesDocumentHeading) notes.insertBefore(notesDocumentHeading, notes.firstChild);
    if (chapterHeading) {
      chapterHeading.classList.remove("chapter-reader-flow-heading");
      if (originalChapterHeadingParent) {
        const reference = originalChapterHeadingNextSibling?.parentNode === originalChapterHeadingParent
          ? originalChapterHeadingNextSibling
          : null;
        originalChapterHeadingParent.insertBefore(chapterHeading, reference);
      }
    }
    for (const { element, parent, nextSibling } of exampleLinks) {
      if (!parent) continue;
      const reference = nextSibling?.parentNode === parent ? nextSibling : null;
      parent.insertBefore(element, reference);
    }
    if (examples) root.append(examples);
  });
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
