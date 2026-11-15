import { notFound, redirect } from "next/navigation";
import { NotebookWorkspace } from "@/components/notebook-workspace";

const STREAMS = new Set(["science", "commerce", "humanities", "developers", "lowersecondary", "classnine", "classten"]);

interface StreamPageProps {
  params: Promise<{ stream: string }>;
}

export default async function StreamPage({ params }: StreamPageProps) {
  const { stream } = await params;
  const normalized = stream.toLowerCase();
  if (!STREAMS.has(normalized)) notFound();
  if (normalized === "classnine" || normalized === "classten") redirect("/lowersecondary");
  return <NotebookWorkspace initialStream={normalized} />;
}
