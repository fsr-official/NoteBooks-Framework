import "@/app/workspace-styles";
import { NotebookWorkspace } from "@/components/notebook-workspace";

export default function HomePage() {
  return <NotebookWorkspace key="home" initialStream="home" />;
}
