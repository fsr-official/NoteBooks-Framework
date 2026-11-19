import { Manrope } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NextMarkdownReader } from "@/components/next-markdown-reader";
import { renderNote } from "@/lib/markdown/renderer";
import { servePublicContent } from "@/lib/public-content-route";

const readerSerif = localFont({
  src: [
    { path: "../../../public/fonts/TestTiemposText-Regular.otf", weight: "400", style: "normal" },
    { path: "../../../public/fonts/TestTiemposText-RegularItalic.otf", weight: "400", style: "italic" },
    { path: "../../../public/fonts/TestTiemposText-Medium.otf", weight: "500", style: "normal" },
    { path: "../../../public/fonts/TestTiemposText-MediumItalic.otf", weight: "500", style: "italic" },
    { path: "../../../public/fonts/TestTiemposText-Semibold.otf", weight: "600", style: "normal" },
    { path: "../../../public/fonts/TestTiemposText-SemiboldItalic.otf", weight: "600", style: "italic" },
    { path: "../../../public/fonts/TestTiemposText-Bold.otf", weight: "700", style: "normal" },
    { path: "../../../public/fonts/TestTiemposText-BoldItalic.otf", weight: "700", style: "italic" },
  ],
  variable: "--reader-serif-font",
  display: "swap",
});
const readerSans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--reader-sans-font",
  display: "swap",
});

type SearchParams = Record<string, string | string[] | undefined>;

const RETURN_ROUTES = new Set([
  "/",
  "/lowersecondary",
  "/science",
  "/commerce",
  "/humanities",
  "/developers",
]);

function oneValue(params: SearchParams, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const owner = oneValue(params, "owner");
  const repository = oneValue(params, "repo");
  const path = oneValue(params, "path");
  const branch = oneValue(params, "branch") ?? "main";
  const returnToValue = oneValue(params, "returnTo") ?? "/";
  const returnTo = RETURN_ROUTES.has(returnToValue) ? returnToValue : "/";

  if (
    !owner
    || !repository
    || !path
    || !/\.(?:md|markdown|mdx)$/i.test(path)
    || !/^[\w.-]{1,100}$/.test(owner)
    || !/^[\w.-]{1,100}$/.test(repository)
  ) {
    notFound();
  }

  const url = new URL("https://notebooks.internal/api/raw");
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repository);
  url.searchParams.set("path", path);
  const response = await servePublicContent(new Request(url), "markdown");

  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <main className="next-reader-error">
        <h1>This note could not be loaded</h1>
        <p>The public file service returned an error ({response.status}). Please try again later.</p>
        <Link href={returnTo}>Back to library</Link>
      </main>
    );
  }

  const source = await response.text();
  const fileSha = response.headers.get("X-File-SHA") ?? "";
  const resolvedBranch = response.headers.get("X-Repository-Branch") ?? branch;
  const rendered = renderNote(source, { owner, repository, branch: resolvedBranch, filePath: path });
  const fileName = path.split("/").at(-1) ?? path;

  return (
    <NextMarkdownReader
      backHref={returnTo}
      file={{ owner, repository, branch: resolvedBranch, path, fileName, fileSha }}
      readerFontClassName={`${readerSerif.variable} ${readerSans.variable}`}
      html={rendered.html}
      searchIndex={rendered.searchIndex}
      tree={rendered.tree}
    />
  );
}
