"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getFileTypeBadge, listDirectoryEntries } from "@/lib/file-explorer";
import { MarkdownReader } from "@/components/markdown-reader";

type LibraryId = "lowersecondary" | "science" | "commerce" | "humanities" | "developer";
type StreamRoute = "lowersecondary" | "science" | "commerce" | "humanities" | "developers";
type ThemePreset =
  | "midnight" | "paper" | "forest" | "violet"
  | "navy-silver" | "forest-cream" | "charcoal-gold" | "plum-blush" | "teal-sand" | "maroon-ivory"
  | "midnight-aurora" | "sunset" | "ocean" | "meadow" | "royal" | "espresso";
type ColorTokens = {
  background: string;
  surface: string;
  main: string;
  accent: string;
  partner: string;
  highlight: string;
  text: string;
  muted: string;
};
type ThemeGroup = { label: string; presets: ThemePreset[] };
type FileFilter = "all" | "markdown" | "pdf" | "other";
type FileSort = "recommended" | "name-asc" | "name-desc";

interface FileLookup {
  branch: string;
  fileName: string;
  filePath: string;
  fileSha: string;
  repository: string;
  repositoryId: string;
  root: string;
}

interface RepositoryLookup {
  branch: string;
  classOrStream: string;
  id: string;
  lfs: boolean;
  name: string;
  owner: string;
  pages: boolean;
  priority: number | null;
  repoName: string;
  root: string;
}

interface IndexResponse<T> {
  schemaVersion: number;
  entries: Record<string, T>;
}

interface Preferences {
  preset: ThemePreset;
  mode: "light" | "dark";
  customAccent: string;
  customBackground: string;
}

interface ClientSession {
  id: string;
  preferences: Preferences;
}

interface ExplorerLocation {
  stream: LibraryId;
  repository: string | null;
  directory: string;
}

const STORAGE_KEY = "notebooks:v2:client-session";
const sessionListeners = new Set<() => void>();
let memorySession: string | null = null;
const MONOTONE_TOKENS: Record<Extract<ThemePreset, "midnight" | "paper" | "forest" | "violet">, Record<"light" | "dark", ColorTokens>> = {
  midnight: {
    dark: { background: "#0b1118", surface: "#121c26", main: "#76e0bd", accent: "#76e0bd", partner: "#9bb9b0", highlight: "#d8fff1", text: "#e7f2ef", muted: "#a7bbb6" },
    light: { background: "#f3f7f5", surface: "#ffffff", main: "#087f5b", accent: "#087f5b", partner: "#466e60", highlight: "#1d5948", text: "#182b26", muted: "#52675f" },
  },
  paper: {
    dark: { background: "#191714", surface: "#24211c", main: "#f2bd78", accent: "#f2bd78", partner: "#ceb997", highlight: "#ffe2b4", text: "#f5eee2", muted: "#c5b9a7" },
    light: { background: "#fbf7ef", surface: "#fffdf8", main: "#a65c16", accent: "#a65c16", partner: "#725b3c", highlight: "#75400e", text: "#2b251e", muted: "#6d6252" },
  },
  forest: {
    dark: { background: "#0c1713", surface: "#13231b", main: "#a8d875", accent: "#a8d875", partner: "#bfdba5", highlight: "#e0ffc0", text: "#eaf3e4", muted: "#b2c2aa" },
    light: { background: "#f2f7ee", surface: "#ffffff", main: "#4b7f2a", accent: "#4b7f2a", partner: "#526a43", highlight: "#315b1b", text: "#1d2b19", muted: "#5e7055" },
  },
  violet: {
    dark: { background: "#12111d", surface: "#1c1a2a", main: "#c5a4ff", accent: "#c5a4ff", partner: "#d6c3f4", highlight: "#efdbff", text: "#f1edfc", muted: "#bbb3cb" },
    light: { background: "#f7f4fc", surface: "#ffffff", main: "#7046b5", accent: "#7046b5", partner: "#65548a", highlight: "#4e2c89", text: "#29233a", muted: "#655d77" },
  },
};

function makePaletteTokens(
  main: string,
  partner: string,
  highlight: string,
  darkBackground: string,
  lightBackground: string,
): Record<"light" | "dark", ColorTokens> {
  return {
    dark: {
      background: darkBackground,
      surface: `color-mix(in srgb, ${darkBackground} 80%, white)`,
      main,
      accent: highlight,
      partner,
      highlight,
      text: "#f5f7fb",
      muted: "#b5becb",
    },
    light: {
      background: lightBackground,
      surface: "#ffffff",
      main,
      accent: main,
      partner,
      highlight,
      text: "#1c2430",
      muted: "#566170",
    },
  };
}

const COLOR_TOKENS: Record<ThemePreset, Record<"light" | "dark", ColorTokens>> = {
  ...MONOTONE_TOKENS,
  "navy-silver": makePaletteTokens("#1E3A8A", "#CBD5E1", "#93C5FD", "#0c1428", "#f3f6fb"),
  "forest-cream": makePaletteTokens("#166534", "#FEF3C7", "#A3E635", "#0b1c13", "#f4f7ed"),
  "charcoal-gold": makePaletteTokens("#27272A", "#F59E0B", "#FCD34D", "#111113", "#f5f5f5"),
  "plum-blush": makePaletteTokens("#6B21A8", "#FBCFE8", "#E9A8FF", "#1a1025", "#faf4fb"),
  "teal-sand": makePaletteTokens("#0F766E", "#E7D5B5", "#7DD3C7", "#0b1b1a", "#f4f7f5"),
  "maroon-ivory": makePaletteTokens("#7F1D1D", "#FAF5E9", "#FCA5A5", "#211112", "#faf7f0"),
  "midnight-aurora": makePaletteTokens("#4338CA", "#2DD4BF", "#F472B6", "#10102b", "#f4f3fc"),
  sunset: makePaletteTokens("#EA580C", "#E11D48", "#7C3AED", "#24110f", "#fff5f1"),
  ocean: makePaletteTokens("#0C4A6E", "#22D3EE", "#FB7185", "#081c2a", "#eff9fc"),
  meadow: makePaletteTokens("#15803D", "#BEF264", "#38BDF8", "#0c2118", "#f3f9ef"),
  royal: makePaletteTokens("#5B21B6", "#FBBF24", "#E2E8F0", "#19102b", "#f7f4fc"),
  espresso: makePaletteTokens("#78350F", "#FEF3C7", "#EA580C", "#21140e", "#fbf6ed"),
};

const THEME_GROUPS: ThemeGroup[] = [
  { label: "Monotone", presets: ["midnight", "paper", "forest", "violet"] },
  { label: "Dual tone", presets: ["navy-silver", "forest-cream", "charcoal-gold", "plum-blush", "teal-sand", "maroon-ivory"] },
  { label: "Triple tone", presets: ["midnight-aurora", "sunset", "ocean", "meadow", "royal", "espresso"] },
];

const THEME_LABELS: Record<ThemePreset, string> = {
  midnight: "Midnight", paper: "Paper", forest: "Forest", violet: "Violet",
  "navy-silver": "Navy & Silver", "forest-cream": "Forest & Cream", "charcoal-gold": "Charcoal & Gold",
  "plum-blush": "Plum & Blush", "teal-sand": "Teal & Sand", "maroon-ivory": "Maroon & Ivory",
  "midnight-aurora": "Midnight Aurora", sunset: "Sunset", ocean: "Ocean", meadow: "Meadow",
  royal: "Royal", espresso: "Espresso",
};

const STREAMS: Array<{ id: LibraryId; route: StreamRoute; title: string; eyebrow: string; description: string; icon: string }> = [
  { id: "lowersecondary", route: "lowersecondary", title: "Lower Secondary", eyebrow: "Build strong foundations", description: "Class 9 and Class 10 resources together in one learning library.", icon: "Ⅱ" },
  { id: "science", route: "science", title: "Science", eyebrow: "Explore the natural world", description: "Clear notes for biology, chemistry, physics, and mathematics.", icon: "✳" },
  { id: "commerce", route: "commerce", title: "Commerce", eyebrow: "Understand how things work", description: "Business, economics, accounting, and practical knowledge.", icon: "◈" },
  { id: "humanities", route: "humanities", title: "Humanities", eyebrow: "Ideas, people, and society", description: "History, civics, culture, and critical perspectives.", icon: "⌘" },
  { id: "developer", route: "developers", title: "Developers", eyebrow: "Build and contribute", description: "Project documentation, guides, and contributor resources.", icon: "⌘" },
];

const LANDING_STREAMS = STREAMS.filter((item) => item.id !== "developer");
const NAV_STREAMS = STREAMS.filter((item) => item.id !== "developer");
const EMPTY_PREFERENCES: Preferences = {
  preset: "midnight",
  mode: "dark",
  customAccent: "",
  customBackground: "",
};
const USERNAME_ADJECTIVES = ["Curious", "Quiet", "Bright", "Clever", "Kind", "Merry", "Calm", "Keen"];
const USERNAME_NOUNS = ["Otter", "Finch", "Fox", "Koala", "Robin", "Panda", "Badger", "Orca"];

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sessionUsername(sessionId: string): string {
  const seed = sessionId.replace(/-/g, "");
  const first = Number.parseInt(seed.slice(0, 8), 16) || 0;
  const second = Number.parseInt(seed.slice(8, 16), 16) || 0;
  return `${USERNAME_ADJECTIVES[first % USERNAME_ADJECTIVES.length]} ${USERNAME_NOUNS[second % USERNAME_NOUNS.length]}`;
}

function subscribeToSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => {
    sessionListeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", listener);
  };
}

function getSessionSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memorySession;
  } catch {
    return memorySession;
  }
}

function getServerSessionSnapshot(): null {
  return null;
}

function saveSession(session: ClientSession): void {
  const serialized = JSON.stringify(session);
  memorySession = serialized;
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Keep preferences available in memory when browser storage is disabled.
  }
  sessionListeners.forEach((listener) => listener());
}

function isLibraryId(value: unknown): value is LibraryId {
  return value === "lowersecondary" || value === "science" || value === "commerce"
    || value === "humanities" || value === "developer";
}

function libraryIdFromRoute(value: string): LibraryId | null {
  if (value === "classnine" || value === "classten") return "lowersecondary";
  if (value === "developers") return "developer";
  return isLibraryId(value) ? value : null;
}

function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === "string" && Object.hasOwn(COLOR_TOKENS, value);
}

function parseSession(serialized: string | null): ClientSession | null {
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (
      !candidate
      || typeof candidate !== "object"
      || !("id" in candidate)
      || typeof candidate.id !== "string"
      || !("preferences" in candidate)
      || typeof candidate.preferences !== "object"
      || candidate.preferences === null
    ) return null;

    const saved = candidate.preferences as Partial<Preferences> & { lastWork?: unknown };
    Reflect.deleteProperty(saved, "lastWork");
    return {
      id: candidate.id,
      preferences: {
        ...EMPTY_PREFERENCES,
        ...saved,
        preset: isThemePreset(saved.preset) ? saved.preset : "midnight",
        mode: saved.mode === "light" ? "light" : "dark",
        customAccent: typeof saved.customAccent === "string" && /^#[\da-f]{6}$/i.test(saved.customAccent) ? saved.customAccent : "",
        customBackground: typeof saved.customBackground === "string" && /^#[\da-f]{6}$/i.test(saved.customBackground) ? saved.customBackground : "",
      },
    };
  } catch {
    return null;
  }
}

function applyTheme(preferences: Preferences): void {
  const tokens = COLOR_TOKENS[preferences.preset][preferences.mode];
  const root = document.documentElement;
  root.dataset.mode = preferences.mode;
  root.style.setProperty("--page", preferences.customBackground || tokens.background);
  root.style.setProperty("--surface", tokens.surface);
  root.style.setProperty("--accent", preferences.customAccent || tokens.accent);
  root.style.setProperty("--palette-main", tokens.main);
  root.style.setProperty("--partner", tokens.partner);
  root.style.setProperty("--highlight", tokens.highlight);
  root.style.setProperty("--text", tokens.text);
  root.style.setProperty("--muted", tokens.muted);
}

function streamTitle(stream: string): string {
  return STREAMS.find((item) => item.id === stream)?.title ?? "NoteBooks";
}

export function NotebookWorkspace({ initialStream }: { initialStream: string }) {
  const stream: LibraryId | "home" = libraryIdFromRoute(initialStream) ?? "home";
  const sessionSnapshot = useSyncExternalStore(subscribeToSession, getSessionSnapshot, getServerSessionSnapshot);
  const session = useMemo(() => parseSession(sessionSnapshot), [sessionSnapshot]);
  const [files, setFiles] = useState<Record<string, FileLookup>>({});
  const [repositories, setRepositories] = useState<Record<string, RepositoryLookup>>({});
  const [query, setQuery] = useState("");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [fileSort, setFileSort] = useState<FileSort>("recommended");
  const [activeFile, setActiveFile] = useState<{ key: string; file: FileLookup; stream: LibraryId } | null>(null);
  const [readerFile, setReaderFile] = useState<FileLookup | null>(null);
  const [explorerLocation, setExplorerLocation] = useState<ExplorerLocation | null>(null);
  const [indexState, setIndexState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [indexError, setIndexError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const indexCache = useRef(new Map<LibraryId, Record<string, FileLookup>>());
  const repoCache = useRef<Record<string, RepositoryLookup> | null>(null);

  useEffect(() => {
    if (!session && !parseSession(getSessionSnapshot())) {
      saveSession({ id: createSessionId(), preferences: EMPTY_PREFERENCES });
    }
  }, [session]);

  useEffect(() => {
    const route = stream === "home" ? "/" : stream === "developer" ? "/developers" : `/${stream}`;
    void fetch("/api/telemetry/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route }),
      keepalive: true,
    }).catch((error: unknown) => {
      console.warn("Unable to record page view", error);
    });
  }, [stream]);

  useEffect(() => {
    if (session) applyTheme(session.preferences);
  }, [session]);

  useEffect(() => {
    if (stream !== "home") return;
    const targets = document.querySelectorAll<HTMLElement>(".library-story");
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return;
    }
    if (!("IntersectionObserver" in window)) return;
    root.classList.add("scroll-reveals-ready");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
      }
    }, { threshold: 0.18, rootMargin: "-10% 0px -10% 0px" });
    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      root.classList.remove("scroll-reveals-ready");
    };
  }, [stream]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  const loadStream = useCallback(async (selectedStream: LibraryId, signal?: AbortSignal) => {
    const cachedFiles = indexCache.current.get(selectedStream);
    if (cachedFiles) {
      setFiles(cachedFiles);
      setIndexState("ready");
      return;
    }

    setIndexState("loading");
    setIndexError("");
    try {
      const [treeResponse, repositoriesResponse] = await Promise.all([
        fetch(`/api/public/json/${selectedStream}-tree.json`, { signal }),
        repoCache.current
          ? Promise.resolve(null)
          : fetch("/api/public/json/github_repositories.json", { signal }),
      ]);
      if (!treeResponse.ok) throw new Error(`The ${streamTitle(selectedStream)} library is unavailable (${treeResponse.status}).`);
      const tree = await treeResponse.json() as IndexResponse<FileLookup>;
      if (tree.schemaVersion !== 1 || typeof tree.entries !== "object" || tree.entries === null) {
        throw new Error("The library index has an unsupported format.");
      }

      if (repositoriesResponse) {
        if (!repositoriesResponse.ok) throw new Error(`The repository catalog is unavailable (${repositoriesResponse.status}).`);
        const repositoryIndex = await repositoriesResponse.json() as IndexResponse<RepositoryLookup>;
        if (repositoryIndex.schemaVersion !== 1 || typeof repositoryIndex.entries !== "object") {
          throw new Error("The repository catalog has an unsupported format.");
        }
        repoCache.current = repositoryIndex.entries;
        setRepositories(repositoryIndex.entries);
      } else if (repoCache.current) {
        setRepositories(repoCache.current);
      }

      indexCache.current.set(selectedStream, tree.entries);
      setFiles(tree.entries);
      setIndexState("ready");
    } catch (error) {
      if (signal?.aborted) return;
      setIndexState("error");
      setIndexError(error instanceof Error ? error.message : "Unable to load this library.");
    }
  }, []);

  useEffect(() => {
    if (stream === "home") {
      return;
    }
    const controller = new AbortController();
    void loadStream(stream, controller.signal);
    return () => controller.abort();
  }, [stream, loadStream]);

  const updatePreferences = useCallback((update: Partial<Preferences>) => {
    if (session) saveSession({ ...session, preferences: { ...session.preferences, ...update } });
  }, [session]);

  const selectFile = useCallback((key: string, file: FileLookup) => {
    if (!isLibraryId(stream)) return;
    const filePath = file.filePath.replace(/\\/g, "/");
    const directory = filePath.split("/").slice(0, -1).join("/");
    setExplorerLocation({ stream, repository: file.repository, directory });
    setActiveFile({ key, file, stream });
  }, [stream]);

  const openFile = useCallback((key: string, file: FileLookup) => {
    selectFile(key, file);
    setReaderFile(file);
  }, [selectFile]);
  const closeReader = useCallback(() => setReaderFile(null), []);

  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return Object.entries(files)
      .filter(([key, file]) => !normalizedQuery
        || key.toLowerCase().includes(normalizedQuery)
        || file.fileName.toLowerCase().includes(normalizedQuery))
      .filter(([, file]) => {
        const lowerName = file.fileName.toLowerCase();
        if (fileFilter === "markdown") return lowerName.endsWith(".md") || lowerName.endsWith(".markdown");
        if (fileFilter === "pdf") return lowerName.endsWith(".pdf");
        if (fileFilter === "other") return !/\.(md|markdown|pdf)$/i.test(lowerName);
        return true;
      })
      .sort(([leftKey, left], [rightKey, right]) => {
        if (fileSort === "recommended") return leftKey.localeCompare(rightKey);
        const comparison = left.fileName.localeCompare(right.fileName);
        return fileSort === "name-desc" ? -comparison : comparison;
      });
  }, [fileFilter, fileSort, files, query]);

  const groupedFiles = useMemo(() => {
    const groups = new Map<string, Array<[string, FileLookup]>>();
    for (const entry of visibleFiles) {
      const repository = entry[1].repository;
      const group = groups.get(repository) ?? [];
      group.push(entry);
      groups.set(repository, group);
    }
    return Array.from(groups.entries()).sort(([left, leftEntries], [right, rightEntries]) => {
      if (fileSort === "name-asc") return left.localeCompare(right);
      if (fileSort === "name-desc") return right.localeCompare(left);
      const leftPriority = repositories[left]?.priority ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = repositories[right]?.priority ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority
        || rightEntries.length - leftEntries.length
        || left.localeCompare(right);
    });
  }, [fileSort, visibleFiles, repositories]);

  const repositoryIndices = useMemo(() => {
    const repositoryNames = Array.from(new Set(Object.values(files).map((file) => file.repository)));
    repositoryNames.sort((left, right) => {
      const leftPriority = repositories[left]?.priority ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = repositories[right]?.priority ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.localeCompare(right);
    });
    return new Map(repositoryNames.map((repository, index) => [repository, index]));
  }, [files, repositories]);

  const activeTheme = session?.preferences ?? EMPTY_PREFERENCES;
  const currentExplorer = explorerLocation?.stream === stream ? explorerLocation : null;
  const selectedRepository = currentExplorer?.repository ?? null;
  const currentDirectory = currentExplorer?.directory ?? "";
  const explorerEntries = selectedRepository
    ? listDirectoryEntries(files, selectedRepository, currentDirectory, query)
    : [];
  const filteredExplorerEntries = explorerEntries
    .filter((entry) => entry.kind === "directory" || fileFilter === "all"
      || (fileFilter === "markdown" && /\.(md|markdown)$/i.test(entry.file.fileName))
      || (fileFilter === "pdf" && /\.pdf$/i.test(entry.file.fileName))
      || (fileFilter === "other" && !/\.(md|markdown|pdf)$/i.test(entry.file.fileName)))
    .sort((left, right) => {
      if (left.kind === "directory" || right.kind === "directory") return 0;
      const comparison = left.file.fileName.localeCompare(right.file.fileName);
      if (fileSort === "name-desc") return -comparison;
      if (fileSort === "name-asc") return comparison;
      return 0;
    });
  const directoryFileCount = filteredExplorerEntries.filter((entry) => entry.kind === "file").length;
  const selectedFile = activeFile?.stream === stream
    && activeFile.file.repository === selectedRepository
    && activeFile.file.filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") === currentDirectory
    ? activeFile
    : null;
  const selectedRepositoryIndex = selectedRepository
    ? repositoryIndices.get(selectedRepository) ?? 0
    : 0;

  return (
    <>
    <main className="workspace">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="NoteBooks home" onClick={() => {
          setExplorerLocation(null);
          setActiveFile(null);
        }}>
          <span className="brand-mark">n</span>
          <span>NoteBooks</span>
          <span className="brand-tag">STUDY SPACE</span>
        </Link>
        <nav className="top-nav" aria-label="Main navigation">
          <Link className={stream === "home" ? "nav-link active" : "nav-link"} href="/" onClick={() => {
            setExplorerLocation(null);
            setActiveFile(null);
          }}>
            <span className="nav-stream-icon nav-home-icon" aria-hidden="true">n</span><span>Home</span>
          </Link>
          {NAV_STREAMS.map((item) => (
            <Link
              className={stream === item.id ? "nav-link active" : "nav-link"}
              href={`/${item.route}`}
              key={item.id}
              onClick={() => {
                setExplorerLocation(null);
                setActiveFile(null);
              }}
            >
              <span className={`nav-stream-icon nav-stream-icon-${item.id}`} aria-hidden="true">
                <span className="nav-icon-glyph">{item.icon}</span>
              </span>
              <span>{item.title}</span>
            </Link>
          ))}
          <Link className="nav-link auth-nav-link" href="/account">Account</Link>
          <Link className="nav-link auth-nav-join" href="/register">Join</Link>
        </nav>
      </header>

      <div className="workspace-layout">
        <aside className="side-rail">
          <div className="session-profile">
            <div className="session-avatar" aria-hidden="true">
              {session ? sessionUsername(session.id).slice(0, 1) : "?"}
            </div>
            <span className="session-profile-label">YOUR SESSION</span>
            <strong>{session ? sessionUsername(session.id) : "Your study space"}</strong>
            <span className="session-id-label">SESSION ID</span>
            <code className="session-id">{session?.id ?? "Creating session…"}</code>
            <p>Your themes and reading place stay in this browser.</p>
          </div>
          <section className="sidebar-theme" aria-label="Theme settings">
            <div className="sidebar-theme-heading">
              <div><span className="eyebrow">PERSONALIZE</span><h2>Color themes</h2></div>
              <button
                className="theme-toggle"
                type="button"
                onClick={() => updatePreferences({ mode: activeTheme.mode === "dark" ? "light" : "dark" })}
                aria-label={`Switch to ${activeTheme.mode === "dark" ? "light" : "dark"} theme`}
              >
                <span aria-hidden="true">{activeTheme.mode === "dark" ? "☼" : "☾"}</span>
                <span>{activeTheme.mode === "dark" ? "Light" : "Dark"}</span>
              </button>
            </div>
            {THEME_GROUPS.map((group) => (
              <details className="sidebar-theme-group" key={group.label} open>
                <summary>{group.label}<span>{group.presets.length} themes</span></summary>
                <div className="sidebar-theme-grid">
                  {group.presets.map((preset) => {
                    const tokens = COLOR_TOKENS[preset][activeTheme.mode];
                    return (
                      <button
                        aria-pressed={activeTheme.preset === preset}
                        className={`sidebar-theme-option ${activeTheme.preset === preset ? "is-selected" : ""}`}
                        key={preset}
                        onClick={() => updatePreferences({ preset, customAccent: "", customBackground: "" })}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="sidebar-theme-swatch"
                          style={{ background: `linear-gradient(135deg, ${tokens.background} 0 38%, ${tokens.main} 38% 65%, ${tokens.partner} 65% 84%, ${tokens.highlight} 84%)` }}
                        />
                        <span>{THEME_LABELS[preset]}</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            ))}
            <div className="sidebar-custom-colors">
              <label>Accent <input type="color" value={activeTheme.customAccent || COLOR_TOKENS[activeTheme.preset][activeTheme.mode].accent} onChange={(event) => updatePreferences({ customAccent: event.target.value })} /></label>
              <label>Canvas <input type="color" value={activeTheme.customBackground || COLOR_TOKENS[activeTheme.preset][activeTheme.mode].background} onChange={(event) => updatePreferences({ customBackground: event.target.value })} /></label>
              {(activeTheme.customAccent || activeTheme.customBackground) && (
                <button className="reset-theme" type="button" onClick={() => updatePreferences({ customAccent: "", customBackground: "" })}>Reset</button>
              )}
            </div>
          </section>
        </aside>

        <section className={stream === "home" ? "main-panel home-main-panel" : "main-panel"}>
          {stream === "home" ? (
            <div className="home-view">
              <section className="welcome-panel">
                <div className="welcome-art" aria-hidden="true">
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <div className="art-orbit orbit-three" />
                  <div className="art-core"><span>n</span><i>✳</i></div>
                </div>
                <div className="welcome-copy welcome-copy-left">
                  <span className="eyebrow"><span className="eyebrow-line" /> A CALMER WAY TO LEARN</span>
                  <h1>Make room for<br /><em>understanding.</em></h1>
                  <p>A thoughtful library for studying deeply and finding your way back to what matters.</p>
                  <Link className="primary-button" href="/lowersecondary" onClick={() => {
                    setExplorerLocation(null);
                    setActiveFile(null);
                  }}>Explore the library <span>↗</span></Link>
                </div>
                <div className="welcome-copy welcome-copy-right">
                  <span className="eyebrow">A SHARED SHELF FOR CURIOUS MINDS</span>
                  <p>Start with the subject you’re curious about. Follow an idea, open a note, and learn at your own pace.</p>
                  <a className="hero-scroll-link" href="#library-stories">Discover the collections <span>↓</span></a>
                </div>
                <span className="hero-index">NOTEBOOKS · STUDY SPACE</span>
              </section>

              <section className="library-stories" id="library-stories" aria-label="Study collections">
                {LANDING_STREAMS.map((item, index) => (
                  <article className={`library-story story-${item.id} ${index % 2 ? "story-reverse" : ""}`} id={`story-${item.id}`} key={item.id}>
                    <div className="story-number">0{index + 1} <span>— 04</span></div>
                    <div className="story-copy">
                      <span className="eyebrow"><span className="eyebrow-line" /> {item.eyebrow}</span>
                      <h2>{item.title}</h2>
                      <p>{item.id === "lowersecondary"
                        ? "Build confidence across Class 9 and Class 10 with a connected collection of notes and study material. Find the topic you need and follow it from foundation to deeper understanding."
                        : item.id === "science"
                          ? "Explore biology, chemistry, physics, and mathematics through clear, organized resources. Move between subjects while keeping each idea connected to the bigger picture."
                          : item.id === "commerce"
                            ? "Make sense of business, economics, and accounting with resources designed to bring concepts into focus and connect classroom learning to practical questions."
                            : "Explore history, civics, culture, and society through materials that invite context, perspective, and thoughtful questions about the world around us."}</p>
                      <Link className="story-link" href={`/${item.route}`} onClick={() => {
                        setExplorerLocation(null);
                        setActiveFile(null);
                      }}>Explore {item.title}<span aria-hidden="true">↗</span></Link>
                    </div>
                    <span className="story-art-symbol" aria-hidden="true">{item.icon}</span>
                  </article>
                ))}
              </section>

              <footer className="home-footer"><span>NoteBooks <b>·</b> A shared shelf for curious minds.</span><span>SESSION {session?.id.slice(0, 8).toUpperCase() ?? "--------"}</span></footer>
            </div>
          ) : (
            <div className="library-view">
              <div className="library-heading">
                <div>
                  <span className="eyebrow"><Link href="/">HOME</Link> <b>/</b> LIBRARY</span>
                  <h1>{streamTitle(stream)}</h1>
                  <p>{STREAMS.find((item) => item.id === stream)?.description}</p>
                </div>
                <div className="library-stat"><strong>{indexState === "ready" ? (selectedRepository ? directoryFileCount : visibleFiles.length) : "—"}</strong><span>FILES IN VIEW</span></div>
              </div>

              <div className="library-toolbar">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files and repositories…" aria-label="Search files and repositories" />
                  <kbd>Ctrl/⌘ K</kbd>
                </label>
                <div className="library-controls">
                  <label>Filter
                    <select aria-label="Filter files" onChange={(event) => setFileFilter(event.target.value as FileFilter)} value={fileFilter}>
                      <option value="all">All files</option>
                      <option value="markdown">Markdown</option>
                      <option value="pdf">PDF</option>
                      <option value="other">Other files</option>
                    </select>
                  </label>
                  <label>Sort
                    <select aria-label="Sort files and repositories" onChange={(event) => setFileSort(event.target.value as FileSort)} value={fileSort}>
                      <option value="recommended">Recommended</option>
                      <option value="name-asc">Name A–Z</option>
                      <option value="name-desc">Name Z–A</option>
                    </select>
                  </label>
                </div>
                <span className={`index-status status-${indexState}`}>
                  <i /> {indexState === "loading" ? "Loading library" : indexState === "error" ? "Unavailable" : `${groupedFiles.length} repositories`}
                </span>
              </div>

              {indexState === "loading" && <div className="library-message"><span className="loading-spinner" /> Loading the {streamTitle(stream)} library…</div>}
              {indexState === "error" && <div className="library-message library-error"><strong>Couldn’t load this library.</strong><span>{indexError}</span><button type="button" onClick={() => void loadStream(stream)}>Try again</button></div>}
              {indexState === "ready" && visibleFiles.length === 0 && <div className="library-message"><strong>{query ? "No files match that search." : "This stream is ready for its first notes."}</strong><span>{query ? "Try a different title or repository name." : "Check back soon as the library grows."}</span></div>}

              {indexState === "ready" && visibleFiles.length > 0 && (
                <div className={`library-content ${selectedFile ? "has-file-detail" : ""}`}>
                  <div className="file-browser">
                    {!selectedRepository ? (
                      <section className="repository-group">
                        <div className="repository-heading"><span className="repo-mark" aria-hidden="true">×</span><span><strong>REPOSITORIES</strong></span><span className="repo-count">{groupedFiles.length}</span></div>
                        <div className="file-list">
                          {groupedFiles.map(([repository, entries]) => {
                            const repositoryIndex = repositoryIndices.get(repository) ?? 0;
                            return (
                            <button
                              className="repository-row"
                              key={repository}
                              type="button"
                              style={{ "--repository-color": `var(--repository-tone-${repositoryIndex % 2})` } as CSSProperties}
                              onClick={() => {
                                setActiveFile(null);
                                setExplorerLocation({ stream, repository, directory: "" });
                              }}
                            >
                              <span className="repository-bullet" aria-hidden="true">•</span>
                              <span className="repository-row-copy">
                                <strong>{repositories[repository]?.name ?? repository.split("/").at(-1)}</strong>
                                <small>{repository}</small>
                              </span>
                              <span className="repo-count">{entries.length} files</span>
                              <span className="file-open">›</span>
                            </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : (
                      <>
                        <nav className="explorer-breadcrumbs" aria-label="Folder path">
                          <button
                            type="button"
                            onClick={() => {
                              setExplorerLocation({ stream, repository: null, directory: "" });
                              setActiveFile(null);
                            }}
                          >
                            All repositories
                          </button>
                          <span aria-hidden="true">/</span>
                          <button
                            type="button"
                            onClick={() => {
                              setExplorerLocation({ stream, repository: selectedRepository, directory: "" });
                              setActiveFile(null);
                            }}
                          >
                            {repositories[selectedRepository]?.name ?? selectedRepository.split("/").at(-1)}
                          </button>
                          {currentDirectory.split("/").filter(Boolean).map((segment, index, segments) => {
                            const path = segments.slice(0, index + 1).join("/");
                            return (
                              <span className="breadcrumb-segment" key={path}>
                                <span aria-hidden="true">/</span>
                                <button
                                  type="button"
                                  aria-current={index === segments.length - 1 ? "location" : undefined}
                                  onClick={() => {
                                    setExplorerLocation({ stream, repository: selectedRepository, directory: path });
                                    setActiveFile(null);
                                  }}
                                >
                                  {segment}
                                </button>
                              </span>
                            );
                          })}
                        </nav>
                        <section className="repository-group">
                          <div className="repository-heading">
                            <span className="repo-mark repository-bullet" style={{ "--repository-color": `var(--repository-tone-${selectedRepositoryIndex % 2})` } as CSSProperties} aria-hidden="true">•</span>
                            <span><strong>{currentDirectory.split("/").at(-1) ?? repositories[selectedRepository]?.name ?? selectedRepository.split("/").at(-1)}</strong><small>{selectedRepository}{currentDirectory ? `/${currentDirectory}` : ""}</small></span>
                            <span className="repo-count">{explorerEntries.length} items</span>
                          </div>
                          <div className="file-list">
                            {filteredExplorerEntries.map((entry) => {
                              if (entry.kind === "directory") {
                                return (
                                  <button
                                    className="folder-row"
                                    key={`directory:${entry.path}`}
                                    type="button"
                                    onClick={() => {
                                      setExplorerLocation({ stream, repository: selectedRepository, directory: entry.path });
                                      setActiveFile(null);
                                    }}
                                  >
                                    <span className="folder-icon" aria-hidden="true">▰</span>
                                    <span className="folder-name">{entry.name}</span>
                                    <span className="file-path">{entry.fileCount} {entry.fileCount === 1 ? "file" : "files"}</span>
                                    <span className="file-open">›</span>
                                  </button>
                                );
                              }

                              const badge = getFileTypeBadge(entry.file.fileName);
                              return (
                                <button
                                  className={`file-row ${selectedFile?.key === entry.key ? "file-selected" : ""}`}
                                  key={entry.key}
                                  type="button"
                                  title="Double-click to read"
                                  onClick={() => selectFile(entry.key, files[entry.key])}
                                  onDoubleClick={() => openFile(entry.key, files[entry.key])}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") openFile(entry.key, files[entry.key]);
                                  }}
                                >
                                  <span className={`file-type file-type-${badge.kind}`} title={badge.kind}>{badge.label}</span>
                                  <span className="file-name">{entry.file.fileName}</span>
                                  <span className="file-path">{entry.file.filePath}</span>
                                  <span className="file-open">›</span>
                                </button>
                              );
                            })}
                            {filteredExplorerEntries.length === 0 && (
                              <p className="folder-empty">{query ? "No files or folders match this search." : "This folder is empty."}</p>
                            )}
                          </div>
                        </section>
                      </>
                    )}
                  </div>

                  {selectedFile && (
                    <aside className="file-detail" aria-label="Selected file details">
                      <div className="file-detail-heading">
                        <span className="detail-eyebrow">SELECTED RESOURCE</span>
                        <button aria-label="Close file details" className="file-detail-close" onClick={() => setActiveFile(null)} type="button">×</button>
                      </div>
                      <div className={`detail-icon file-type-${getFileTypeBadge(selectedFile.file.fileName).kind}`}>{getFileTypeBadge(selectedFile.file.fileName).label}</div>
                      <h2>{selectedFile.file.fileName}</h2>
                      <p className="detail-path">{selectedFile.file.filePath}</p>
                      <div className="detail-rule" />
                      <dl>
                        <div><dt>Repository</dt><dd>{selectedFile.file.repository}</dd></div>
                        <div><dt>Branch</dt><dd>{selectedFile.file.branch}</dd></div>
                        <div><dt>File SHA</dt><dd><code>{selectedFile.file.fileSha.slice(0, 12)}…</code></dd></div>
                      </dl>
                      <button className="primary-button detail-open" onClick={() => openFile(selectedFile.key, selectedFile.file)} type="button">Open file <span>↗</span></button>
                      <a className="primary-button detail-source" href={`https://github.com/${selectedFile.file.repository}/blob/${selectedFile.file.branch.split("/").map(encodeURIComponent).join("/")}/${selectedFile.file.filePath.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer">Open source on GitHub <span>↗</span></a>
                      <p className="detail-note">Your reading place is saved to this browser session.</p>
                    </aside>
                  )}
                </div>
              )}
              <footer className="home-footer"><span>File indexes update as repositories change.</span><Link href="/">Back to overview ↑</Link></footer>
            </div>
          )}
        </section>
      </div>
    </main>
    {readerFile && (
      <MarkdownReader
        key={`${readerFile.repository}:${readerFile.filePath}:${readerFile.fileSha}`}
        file={readerFile}
        onClose={closeReader}
      />
    )}
    </>
  );
}
