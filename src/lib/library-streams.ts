export type LibraryId = "lowersecondary" | "science" | "commerce" | "humanities" | "developer";
export type StreamRoute = "lowersecondary" | "science" | "commerce" | "humanities" | "developers";

export interface LibraryStream {
  id: LibraryId;
  route: StreamRoute;
  title: string;
  eyebrow: string;
  description: string;
  icon: string;
}

export const STREAMS: LibraryStream[] = [
  { id: "lowersecondary", route: "lowersecondary", title: "Lower Secondary", eyebrow: "Build strong foundations", description: "Class 9 and Class 10 resources together in one learning library.", icon: "Ⅱ" },
  { id: "science", route: "science", title: "Science", eyebrow: "Explore the natural world", description: "Clear notes for biology, chemistry, physics, and mathematics.", icon: "✳" },
  { id: "commerce", route: "commerce", title: "Commerce", eyebrow: "Understand how things work", description: "Business, economics, accounting, and practical knowledge.", icon: "◈" },
  { id: "humanities", route: "humanities", title: "Humanities", eyebrow: "Ideas, people, and society", description: "History, civics, culture, and critical perspectives.", icon: "⌘" },
  { id: "developer", route: "developers", title: "Developers", eyebrow: "Build and contribute", description: "Project documentation, guides, and contributor resources.", icon: "››" },
];
