const MAIN_SECTION = /^SECTION-(\d+)$/;
const SUBSECTION = /^(\d+(?:\.\d+)+)$/;

export function outlineSectionId(sectionId) {
  if (sectionId === "chapter-overview" || MAIN_SECTION.test(sectionId)) return sectionId;
  const subsection = sectionId.match(SUBSECTION);
  return subsection ? `SECTION-${subsection[1].split(".")[0]}` : "";
}

export function buildChapterOutline(entries, headings) {
  const overview = entries.find((entry) => entry.id === "chapter-overview");
  const sections = entries
    .map((entry) => {
      const match = entry.id.match(MAIN_SECTION);
      if (!match) return null;
      const number = match[1];
      return {
        ...entry,
        kind: "section",
        children: headings.filter((heading) => {
          const subsection = heading.id.match(SUBSECTION);
          return subsection?.[1].split(".")[0] === number;
        }),
      };
    })
    .filter(Boolean);

  return [
    ...(overview ? [{ ...overview, kind: "overview", children: [] }] : []),
    ...sections,
  ];
}
