import type { NoteSearchBlock, NoteSection } from "@/lib/markdown/renderer";

function findSectionTitle(tree: NoteSection[], sectionId: string): string | null {
  for (const section of tree) {
    if (section.id === sectionId) return `${section.number} ${section.title}`.trim();
    const childTitle = findSectionTitle(section.children, sectionId);
    if (childTitle) return childTitle;
  }
  return null;
}

export function getRelevantNoteContext(
  query: string,
  searchIndex: NoteSearchBlock[],
  tree: NoteSection[],
  activeSectionId: string,
  selectedText: string,
): Array<{ title: string; text: string }> {
  const selected = selectedText.trim();
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 20);
  const stopWords = new Set(["about", "after", "also", "and", "are", "can", "does", "for", "from", "how", "into", "its", "that", "the", "this", "what", "when", "where", "which", "with", "would", "why"]);
  const usefulWords = words.filter((word) => !stopWords.has(word));
  const ranked = searchIndex.map((block, index) => {
    const text = block.text.toLowerCase();
    const score = usefulWords.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
    return { block, index, score };
  }).filter(({ score }) => score > 0);
  const candidates = ranked.length
    ? ranked.sort((left, right) => right.score - left.score || left.index - right.index)
    : searchIndex
      .map((block, index) => ({ block, index, score: block.sectionId === activeSectionId ? 1 : 0 }))
      .filter(({ score }) => score > 0);

  const sections: Array<{ title: string; text: string }> = selected
    ? [{ title: "Selected text", text: selected.slice(0, 6000) }]
    : [];
  const seen = new Set<string>();
  let totalLength = sections[0]?.text.length ?? 0;
  for (const { block } of candidates) {
    if (seen.has(block.blockId) || sections.length >= 6 || totalLength >= 9000) continue;
    if (selected && (block.text.includes(selected) || selected.includes(block.text))) continue;
    const text = block.text.trim().slice(0, Math.min(2400, 9000 - totalLength));
    if (!text) continue;
    seen.add(block.blockId);
    totalLength += text.length;
    sections.push({ title: findSectionTitle(tree, block.sectionId) ?? "Note excerpt", text });
  }
  return sections;
}
