export type ChapterReaderOptions = {
  desmosApiKey?: string;
};

export function attachChapterReader(
  root: HTMLElement,
  options?: ChapterReaderOptions,
): () => void;
