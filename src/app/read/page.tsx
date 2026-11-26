import localFont from "next/font/local";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NextMarkdownReader } from "@/components/next-markdown-reader";
import { ChapterReader } from "@/components/chapter-bundle/chapter-reader";
import { PrecompiledHtmlReader } from "@/components/precompiled-html-reader/reader";
import { getChapterBundle } from "@/lib/chapter-bundle/server";
import { precompiledChapterId } from "@/lib/chapter-bundle/selection";
import { renderNote, type RenderedNote } from "@/lib/markdown/renderer";
import { MdxCompileError, renderMdxNote } from "@/lib/markdown/mdx-compiler";
import { localPrecompiledHtmlDirectory, readLocalPrecompiledHtml } from "@/lib/precompiled-html";
import { getReadRouteDataProvider } from "@/lib/read-route-data";
import "katex/dist/katex.min.css";
import "../reader-redesign.css";
import "../chapter-reader.css";
import "../precompiled-html-reader.css";

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
  const isHtmlFile = path ? /\.html$/i.test(path) : false;
  const isMdxFile = path ? /\.mdx$/i.test(path) : false;
  const localHtmlDirectory = isHtmlFile && owner && repository
    ? localPrecompiledHtmlDirectory(owner, repository)
    : undefined;
  const isLocalHtml = isHtmlFile && Boolean(localHtmlDirectory);
  const returnToValue = oneValue(params, "returnTo") ?? "/";
  const returnTo = RETURN_ROUTES.has(returnToValue) ? returnToValue : "/";

  if (
    !owner
    || !repository
    || !path
    || (!isHtmlFile && !/\.(?:md|markdown|mdx)$/i.test(path))
    || !/^[\w.-]{1,100}$/.test(owner)
    || !/^[\w.-]{1,100}$/.test(repository)
  ) {
    notFound();
  }

  const routeIdentity = { owner, repository, path, branch };
  const dataProvider = getReadRouteDataProvider(routeIdentity);
  let response: Response | null = null;
  let mdxRenderingEnabled = false;
  let featureFlagReadFailed = false;
  if ((isMdxFile || isHtmlFile) && !isLocalHtml) {
    try {
      mdxRenderingEnabled = await dataProvider.isMdxRenderingEnabled(routeIdentity);
    } catch (error) {
      featureFlagReadFailed = true;
      console.error("Could not read the MDX rendering settings", {
        owner,
        repository,
        path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (isHtmlFile && !isLocalHtml && !mdxRenderingEnabled) {
    if (featureFlagReadFailed) {
      return (
        <main className="next-reader-error">
          <h1>The compiled reader is unavailable</h1>
          <p>Its repository rendering setting could not be checked. Please try again later.</p>
          <Link href={returnTo}>Back to library</Link>
        </main>
      );
    }
    notFound();
  }

  let source: string;
  if (isLocalHtml && localHtmlDirectory) {
    try {
      source = await readLocalPrecompiledHtml(localHtmlDirectory, path);
    } catch (error) {
      console.error("Could not read local compiled HTML", {
        path,
        reason: error instanceof Error ? error.message : String(error),
      });
      return (
        <main className="next-reader-error">
          <h1>The local compiled page could not be loaded</h1>
          <p>Check the local HTML build output and try again.</p>
          <Link href={returnTo}>Back to library</Link>
        </main>
      );
    }
  } else {
    const url = new URL("https://notebooks.internal/api/raw");
    url.searchParams.set("owner", owner);
    url.searchParams.set("repo", repository);
    url.searchParams.set("path", path);
    response = await dataProvider.servePublicContent(new Request(url), routeIdentity);

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
    source = await response.text();
  }

  if (isHtmlFile) {
    return (
      <PrecompiledHtmlReader
        html={source}
        title={path.split("/").at(-1) ?? path}
        owner={owner}
        repository={repository}
        branch={response?.headers.get("X-Repository-Branch") ?? branch}
        filePath={path}
        fileSha={response?.headers.get("X-File-SHA") ?? ""}
        backHref={returnTo}
        readerFontClassName={readerSerif.variable}
        desmosApiKey={process.env.DESMOS_API_KEY}
        stale={response?.headers.get("X-Compiled-HTML-Stale") === "true"}
      />
    );
  }

  const fileSha = response?.headers.get("X-File-SHA") ?? "";
  const resolvedBranch = response?.headers.get("X-Repository-Branch") ?? branch;
  const sourceInfo = { owner, repository, branch: resolvedBranch, filePath: path };

  const chapterId = mdxRenderingEnabled
    ? precompiledChapterId(owner, repository, path)
    : null;
  if (chapterId) {
    const commitSha = process.env.NOTEBOOKS_MDX_COMMIT_SHA;
    if (!commitSha) {
      console.warn("Precompiled chapter was not selected; using the existing reader", {
        chapterId,
        reason: "NOTEBOOKS_MDX_COMMIT_SHA is not configured",
      });
    } else {
      let bundleResult: Awaited<ReturnType<typeof getChapterBundle>> | null = null;
      try {
        bundleResult = await getChapterBundle(chapterId, commitSha);
      } catch (error) {
        console.error("Precompiled chapter selection failed; using the existing reader", {
          chapterId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      if (bundleResult) {
        return (
          <ChapterReader
            bundle={bundleResult.bundle}
            sourceCommitSha={bundleResult.sourceCommitSha}
            stale={bundleResult.stale}
            backHref={returnTo}
          />
        );
      }
    }
  }

  let rendered: RenderedNote;
  try {
    rendered = isMdxFile && mdxRenderingEnabled
      ? await renderMdxNote(source, sourceInfo)
      : renderNote(source, sourceInfo);
  } catch (error) {
    console.error("Could not render a repository note", error);
    const message = error instanceof MdxCompileError
      ? error.message
      : "The note renderer is unavailable. Please try again later.";
    return (
      <main className="next-reader-error">
        <h1>This note could not be rendered</h1>
        <p>{message}</p>
        <Link href={returnTo}>Back to library</Link>
      </main>
    );
  }
  const fileName = path.split("/").at(-1) ?? path;

  return (
    <NextMarkdownReader
      backHref={returnTo}
      file={{ owner, repository, branch: resolvedBranch, path, fileName, fileSha }}
      readerFontClassName={readerSerif.variable}
      html={rendered.html}
      searchIndex={rendered.searchIndex}
      tree={rendered.tree}
    />
  );
}
