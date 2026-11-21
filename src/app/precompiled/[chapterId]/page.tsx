import "@/app/reader-redesign.css";
import "@/app/chapter-reader.css";
import { ChapterReader } from "@/components/chapter-bundle/chapter-reader";
import { getChapterBundle } from "@/lib/chapter-bundle/server";
import { isMdxRenderingEnabled } from "@/lib/mdx-feature-flag";

type Props = {
  params: Promise<{ chapterId: string }>;
};

function Unavailable({ message }: { message: string }) {
  return (
    <main className="next-note-reader chapter-reader-app">
      <section className="chapter-reader-unavailable">
        <h1>Precompiled chapter unavailable</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

export default async function PrecompiledChapterPage({ params }: Props) {
  const { chapterId } = await params;
  let enabled = false;
  try {
    enabled = await isMdxRenderingEnabled();
  } catch (error) {
    console.error("Could not read the MDX rendering feature flag for the precompiled route", {
      chapterId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return <Unavailable message="The precompiled reader is disabled because its feature flag could not be verified." />;
  }
  if (!enabled) return <Unavailable message="The precompiled reader is currently disabled." />;

  const commitSha = process.env.NOTEBOOKS_MDX_COMMIT_SHA;
  if (!commitSha) {
    return <Unavailable message="NOTEBOOKS_MDX_COMMIT_SHA must be configured with a full Developers commit SHA." />;
  }

  let result: Awaited<ReturnType<typeof getChapterBundle>> | null = null;
  try {
    result = await getChapterBundle(chapterId, commitSha);
  } catch (error) {
    console.error("Precompiled chapter route could not load its bundle", {
      chapterId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  if (!result) return <Unavailable message="The pinned chapter bundle is unavailable or invalid." />;
  return (
    <ChapterReader
      bundle={result.bundle}
      sourceCommitSha={result.sourceCommitSha}
      stale={result.stale}
      backHref="/"
    />
  );
}
