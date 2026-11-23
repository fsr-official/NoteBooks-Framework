type ReaderRouteTarget = {
  branch: string;
  filePath: string;
  repository: string;
};

export function readerHref(file: ReaderRouteTarget, returnTo: string): string | null {
  const [owner, repository, ...extra] = file.repository.split("/");
  if (!owner || !repository || extra.length > 0) return null;
  const isMarkdown = /\.(?:md|markdown|mdx)$/i.test(file.filePath);
  const isDeveloperHtml = /\.html$/i.test(file.filePath)
    && owner.toLowerCase() === "fsr-official"
    && repository.toLowerCase() === "notebooks-developers";
  if (!isMarkdown && !isDeveloperHtml) return null;
  const params = new URLSearchParams({
    owner,
    repo: repository,
    path: file.filePath,
    branch: file.branch,
    returnTo,
  });
  return `/read?${params.toString()}`;
}
