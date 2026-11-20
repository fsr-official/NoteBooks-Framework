import "@/app/workspace-styles";
import { NotebookWorkspace } from "@/components/notebook-workspace";

export default function Page() {
  return <NotebookWorkspace key="account" initialStream="account" />;
}
