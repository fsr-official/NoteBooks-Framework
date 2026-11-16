"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getFileTypeBadge, listDirectoryEntries } from "@/lib/file-explorer";
import { MarkdownReader } from "@/components/markdown-reader";

type LibraryId = "lowersecondary" | "science" | "commerce" | "humanities" | "developer";
type StreamRoute = "lowersecondary" | "science" | "commerce" | "humanities" | "developers";
type ThemePreset = "midnight" | "paper" | "forest" | "violet";
type ColorTokens = { background: string; surface: string; accent: string; text: string; muted: string };

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

interface LastWork {
  stream: LibraryId;
  fileKey: string;
  fileName: string;
  filePath: string;
  repository: string;
  savedAt: string;
}

interface Preferences {
  preset: ThemePreset;
  mode: "light" | "dark";
  customAccent: string;
  customBackground: string;
  lastWork: LastWork | null;
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
const DEFAULT_TOKENS: Record<ThemePreset, Record<"light" | "dark", ColorTokens>> = {
  midnight: {
    dark: { background: "#0b1118", surface: "#121c26", accent: "#76e0bd", text: "#e7f2ef", muted: "#8da39f" },
    light: { background: "#f3f7f5", surface: "#ffffff", accent: "#087f5b", text: "#182b26", muted: "#647a73" },
  },
  paper: {
    dark: { background: "#191714", surface: "#24211c", accent: "#f2bd78", text: "#f5eee2", muted: "#b1a695" },
    light: { background: "#fbf7ef", surface: "#fffdf8", accent: "#a65c16", text: "#2b251e", muted: "#827666" },
  },
  forest: {
    dark: { background: "#0c1713", surface: "#13231b", accent: "#a8d875", text: "#eaf3e4", muted: "#9bae94" },
    light: { background: "#f2f7ee", surface: "#ffffff", accent: "#4b7f2a", text: "#1d2b19", muted: "#6d7f63" },
  },
  violet: {
    dark: { background: "#12111d", surface: "#1c1a2a", accent: "#c5a4ff", text: "#f1edfc", muted: "#a49bb9" },
    light: { background: "#f7f4fc", surface: "#ffffff", accent: "#7046b5", text: "#29233a", muted: "#766e88" },
  },
};

const STREAMS: Array<{ id: LibraryId; route: StreamRoute; title: string; eyebrow: string; description: string; icon: string }> = [
  { id: "lowersecondary", route: "lowersecondary", title: "Lower Secondary", eyebrow: "Build strong foundations", description: "Class 9 and Class 10 resources together in one learning library.", icon: "Ⅱ" },
  { id: "science", route: "science", title: "Science", eyebrow: "Explore the natural world", description: "Clear notes for biology, chemistry, physics, and mathematics.", icon: "✳" },
  { id: "commerce", route: "commerce", title: "Commerce", eyebrow: "Understand how things work", description: "Business, economics, accounting, and practical knowledge.", icon: "◈" },
  { id: "humanities", route: "humanities", title: "Humanities", eyebrow: "Ideas, people, and society", description: "History, civics, culture, and critical perspectives.", icon: "⌘" },
  { id: "developer", route: "developers", title: "Developers", eyebrow: "Build and contribute", description: "Project documentation, guides, and contributor resources.", icon: "⌘" },
];

const EMPTY_PREFERENCES: Preferences = {
  preset: "midnight",
  mode: "dark",
  customAccent: "",
  customBackground: "",
  lastWork: null,
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

function streamRoute(stream: LibraryId): StreamRoute {
  return STREAMS.find((item) => item.id === stream)?.route ?? "science";
}

function isThemePreset(value: unknown): value is ThemePreset {
  return value === "midnight" || value === "paper" || value === "forest" || value === "violet";
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

    const saved = candidate.preferences as Partial<Preferences>;
    const savedWork = saved.lastWork;
    const savedStream = savedWork && typeof savedWork === "object"
      ? libraryIdFromRoute(savedWork.stream)
      : null;
    const validLastWork = savedWork
      && savedStream
      && typeof savedWork.fileKey === "string"
      && typeof savedWork.fileName === "string"
      && typeof savedWork.filePath === "string"
      && typeof savedWork.repository === "string"
      && typeof savedWork.savedAt === "string"
      ? { ...savedWork, stream: savedStream }
      : null;
    return {
      id: candidate.id,
      preferences: {
        ...EMPTY_PREFERENCES,
        ...saved,
        preset: isThemePreset(saved.preset) ? saved.preset : "midnight",
        mode: saved.mode === "light" ? "light" : "dark",
        customAccent: typeof saved.customAccent === "string" && /^#[\da-f]{6}$/i.test(saved.customAccent) ? saved.customAccent : "",
        customBackground: typeof saved.customBackground === "string" && /^#[\da-f]{6}$/i.test(saved.customBackground) ? saved.customBackground : "",
        lastWork: validLastWork,
      },
    };
  } catch {
    return null;
  }
}

function applyTheme(preferences: Preferences): void {
  const tokens = DEFAULT_TOKENS[preferences.preset][preferences.mode];
  const root = document.documentElement;
  root.dataset.mode = preferences.mode;
  root.style.setProperty("--page", preferences.customBackground || tokens.background);
  root.style.setProperty("--surface", tokens.surface);
  root.style.setProperty("--accent", preferences.customAccent || tokens.accent);
  root.style.setProperty("--text", tokens.text);
  root.style.setProperty("--muted", tokens.muted);
}

function streamTitle(stream: string): string {
  return STREAMS.find((item) => item.id === stream)?.title ?? "NoteBooks";
}

export function NotebookWorkspace({ initialStream }: { initialStream: string }) {
  const stream: LibraryId | "home" = libraryIdFromRoute(initialStream) ?? "home";
  const router = useRouter();
  const sessionSnapshot = useSyncExternalStore(subscribeToSession, getSessionSnapshot, getServerSessionSnapshot);
  const session = useMemo(() => parseSession(sessionSnapshot), [sessionSnapshot]);
  const [files, setFiles] = useState<Record<string, FileLookup>>({});
  const [repositories, setRepositories] = useState<Record<string, RepositoryLookup>>({});
  const [query, setQuery] = useState("");
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

  const lastWork = session?.preferences.lastWork ?? null;
  const restoreLastWork = useCallback(() => {
    if (!lastWork || !isLibraryId(lastWork.stream)) return;
    router.push(`/${streamRoute(lastWork.stream)}`);
  }, [lastWork, router]);

  const updatePreferences = useCallback((update: Partial<Preferences>) => {
    if (session) saveSession({ ...session, preferences: { ...session.preferences, ...update } });
  }, [session]);

  const selectFile = useCallback((key: string, file: FileLookup) => {
    if (!isLibraryId(stream)) return;
    const filePath = file.filePath.replace(/\\/g, "/");
    const directory = filePath.split("/").slice(0, -1).join("/");
    setExplorerLocation({ stream, repository: file.repository, directory });
    const work: LastWork = {
      stream,
      fileKey: key,
      fileName: file.fileName,
      filePath: file.filePath,
      repository: file.repository,
      savedAt: new Date().toISOString(),
    };
    setActiveFile({ key, file, stream });
    updatePreferences({ lastWork: work });
  }, [stream, updatePreferences]);

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
      .sort(([left], [right]) => left.localeCompare(right));
  }, [files, query]);

  const groupedFiles = useMemo(() => {
    const groups = new Map<string, Array<[string, FileLookup]>>();
    for (const entry of visibleFiles) {
      const repository = entry[1].repository;
      const group = groups.get(repository) ?? [];
      group.push(entry);
      groups.set(repository, group);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => {
      const leftPriority = repositories[left]?.priority ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = repositories[right]?.priority ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.localeCompare(right);
    });
  }, [visibleFiles, repositories]);

  const activeTheme = session?.preferences ?? EMPTY_PREFERENCES;
  const currentExplorer = explorerLocation?.stream === stream ? explorerLocation : null;
  const selectedRepository = currentExplorer
    ? currentExplorer.repository
    : lastWork?.stream === stream ? lastWork.repository : null;
  const savedDirectory = lastWork?.stream === stream && lastWork.repository === selectedRepository
    ? lastWork.filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/")
    : "";
  const currentDirectory = currentExplorer ? currentExplorer.directory : savedDirectory;
  const explorerEntries = selectedRepository
    ? listDirectoryEntries(files, selectedRepository, currentDirectory, query)
    : [];
  const directoryFileCount = explorerEntries.filter((entry) => entry.kind === "file").length;
  const selectedFile = activeFile?.stream === stream
    && activeFile.file.repository === selectedRepository
    && activeFile.file.filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") === currentDirectory
    ? activeFile
    : lastWork?.stream === stream && files[lastWork.fileKey]
      && lastWork.repository === selectedRepository
      && lastWork.filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") === currentDirectory
      ? { key: lastWork.fileKey, file: files[lastWork.fileKey], stream }
      : null;

  return (
    <>
    <main className="workspace">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="NoteBooks home">
          <span className="brand-mark">n</span>
          <span>NoteBooks</span>
          <span className="brand-tag">STUDY SPACE</span>
        </Link>
        <nav className="top-nav" aria-label="Main navigation">
          <Link className={stream === "home" ? "nav-link active" : "nav-link"} href="/">Home</Link>
          {STREAMS.map((item) => (
            <Link
              className={stream === item.id ? "nav-link active" : "nav-link"}
              href={`/${item.route}`}
              key={item.id}
            >
              {item.title}
            </Link>
          ))}
          <Link className="nav-link auth-nav-link" href="/account">Account</Link>
          <Link className="nav-link auth-nav-link" href="/admin">Admin</Link>
          <Link className="nav-link auth-nav-join" href="/register">Join</Link>
        </nav>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => updatePreferences({ mode: activeTheme.mode === "dark" ? "light" : "dark" })}
          aria-label={`Switch to ${activeTheme.mode === "dark" ? "light" : "dark"} theme`}
        >
          <span aria-hidden="true">{activeTheme.mode === "dark" ? "☼" : "☾"}</span>
          <span className="theme-toggle-label">{activeTheme.mode === "dark" ? "Light" : "Dark"}</span>
        </button>
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
        </aside>

        <section className="main-panel">
          {stream === "home" ? (
            <div className="home-view">
              <section className="welcome-panel">
                <div className="welcome-copy">
                  <span className="eyebrow"><span className="eyebrow-line" /> A CALMER WAY TO LEARN</span>
                  <h1>Make room for<br /><em>understanding.</em></h1>
                  <p>A thoughtful library for studying deeply, finding your way back, and making knowledge easier to share.</p>
                  <div className="welcome-actions">
                    <Link className="primary-button" href="/science">Explore the library <span>↗</span></Link>
                    <span className="welcome-note">Pick a stream. Find your next idea.</span>
                  </div>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <div className="art-core"><span>n</span><i>✳</i></div>
                  <div className="art-label art-label-top">LEARN WITH CLARITY</div>
                  <div className="art-label art-label-bottom">RETURN WITH CONTEXT</div>
                </div>
              </section>

              {lastWork && (
                <button className="continue-card" type="button" onClick={() => void restoreLastWork()}>
                  <span className="continue-icon">↗</span>
                  <span className="continue-copy"><small>CONTINUE WHERE YOU LEFT OFF</small><strong>{lastWork.fileName}</strong><span>{streamTitle(lastWork.stream)} <b>·</b> {lastWork.repository}</span></span>
                  <span className="continue-action">Resume <b>→</b></span>
                </button>
              )}

              <div className="section-heading">
                <div><span className="eyebrow">THE LIBRARY</span><h2>Choose your direction</h2></div>
                <span className="section-aside">Five collections. One shared shelf.</span>
              </div>
              <div className="stream-cards">
                {STREAMS.map((item, index) => (
                  <Link className={`stream-card stream-card-${item.id}`} href={`/${item.route}`} key={item.id}>
                    <span className="stream-card-top"><span className="stream-card-icon">{item.icon}</span><span className="stream-card-index">0{index + 1}</span></span>
                    <span className="stream-card-eyebrow">{item.eyebrow}</span>
                    <strong>{item.title}</strong>
                    <span className="stream-card-description">{item.description}</span>
                    <span className="stream-card-link">Browse stream <b>↗</b></span>
                  </Link>
                ))}
              </div>

              <section className="theme-studio">
                <div className="theme-studio-copy">
                  <span className="eyebrow">MAKE IT YOURS</span>
                  <h2>A reading room<br />that feels like yours.</h2>
                  <p>Choose a mood. Tune the colors. Your theme follows this browser wherever you return.</p>
                  <span className="theme-saved"><span /> Saved to your session</span>
                </div>
                <div className="theme-controls">
                  <div className="theme-preset-grid" aria-label="Theme presets">
                    {(["midnight", "paper", "forest", "violet"] as ThemePreset[]).map((preset) => (
                      <button
                        className={`preset-button ${activeTheme.preset === preset ? "preset-active" : ""}`}
                        key={preset}
                        type="button"
                        onClick={() => updatePreferences({ preset })}
                        aria-pressed={activeTheme.preset === preset}
                      >
                        <span className={`preset-swatch preset-${preset}`} />
                        <span>{preset}</span>
                      </button>
                    ))}
                  </div>
                  <div className="custom-colors">
                    <label>Accent <input type="color" value={activeTheme.customAccent || DEFAULT_TOKENS[activeTheme.preset][activeTheme.mode].accent} onChange={(event) => updatePreferences({ customAccent: event.target.value })} /></label>
                    <label>Canvas <input type="color" value={activeTheme.customBackground || DEFAULT_TOKENS[activeTheme.preset][activeTheme.mode].background} onChange={(event) => updatePreferences({ customBackground: event.target.value })} /></label>
                    <button className="reset-theme" type="button" onClick={() => updatePreferences({ customAccent: "", customBackground: "" })}>Reset colors</button>
                  </div>
                </div>
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
                <span className={`index-status status-${indexState}`}>
                  <i /> {indexState === "loading" ? "Loading library" : indexState === "error" ? "Unavailable" : `${groupedFiles.length} repositories`}
                </span>
              </div>

              {indexState === "loading" && <div className="library-message"><span className="loading-spinner" /> Loading the {streamTitle(stream)} library…</div>}
              {indexState === "error" && <div className="library-message library-error"><strong>Couldn’t load this library.</strong><span>{indexError}</span><button type="button" onClick={() => void loadStream(stream)}>Try again</button></div>}
              {indexState === "ready" && visibleFiles.length === 0 && <div className="library-message"><strong>{query ? "No files match that search." : "This stream is ready for its first notes."}</strong><span>{query ? "Try a different title or repository name." : "Check back soon as the library grows."}</span></div>}

              {indexState === "ready" && visibleFiles.length > 0 && (
                <div className="library-content">
                  <div className="file-browser">
                    {!selectedRepository ? (
                      <section className="repository-group">
                        <div className="repository-heading"><span className="repo-mark">▰</span><span><strong>Repositories</strong><small>Choose a repository to browse its folders</small></span><span className="repo-count">{groupedFiles.length}</span></div>
                        <div className="file-list">
                          {groupedFiles.map(([repository, entries]) => (
                            <button
                              className="repository-row"
                              key={repository}
                              type="button"
                              onClick={() => {
                                setActiveFile(null);
                                setExplorerLocation({ stream, repository, directory: "" });
                              }}
                            >
                              <span className="folder-icon" aria-hidden="true">▰</span>
                              <span className="repository-row-copy">
                                <strong>{repositories[repository]?.name ?? repository.split("/").at(-1)}</strong>
                                <small>{repository}</small>
                              </span>
                              <span className="repo-count">{entries.length} files</span>
                              <span className="file-open">›</span>
                            </button>
                          ))}
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
                            <span className="repo-mark">▰</span>
                            <span><strong>{currentDirectory.split("/").at(-1) ?? repositories[selectedRepository]?.name ?? selectedRepository.split("/").at(-1)}</strong><small>{selectedRepository}{currentDirectory ? `/${currentDirectory}` : ""}</small></span>
                            <span className="repo-count">{explorerEntries.length} items</span>
                          </div>
                          <div className="file-list">
                            {explorerEntries.map((entry) => {
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
                            {explorerEntries.length === 0 && (
                              <p className="folder-empty">{query ? "No files or folders match this search." : "This folder is empty."}</p>
                            )}
                          </div>
                        </section>
                      </>
                    )}
                  </div>

                  <aside className="file-detail">
                    {selectedFile ? (
                      <>
                        <span className="detail-eyebrow">SELECTED RESOURCE</span>
                        <div className={`detail-icon file-type-${getFileTypeBadge(selectedFile.file.fileName).kind}`}>{getFileTypeBadge(selectedFile.file.fileName).label}</div>
                        <h2>{selectedFile.file.fileName}</h2>
                        <p className="detail-path">{selectedFile.file.filePath}</p>
                        <div className="detail-rule" />
                        <dl>
                          <div><dt>Repository</dt><dd>{selectedFile.file.repository}</dd></div>
                          <div><dt>Branch</dt><dd>{selectedFile.file.branch}</dd></div>
                          <div><dt>File SHA</dt><dd><code>{selectedFile.file.fileSha.slice(0, 12)}…</code></dd></div>
                        </dl>
                        <a className="primary-button detail-source" href={`https://github.com/${selectedFile.file.repository}/blob/${selectedFile.file.branch.split("/").map(encodeURIComponent).join("/")}/${selectedFile.file.filePath.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer">Open source on GitHub <span>↗</span></a>
                        <p className="detail-note">Double-click this file to open the reading view. Your place is saved to this browser session.</p>
                      </>
                    ) : (
                      <div className="detail-empty"><span className="detail-empty-icon">↖</span><strong>Choose something to explore</strong><p>Select a file to see its source and save your place for next time.</p></div>
                    )}
                  </aside>
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
