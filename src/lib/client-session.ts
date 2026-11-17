"use client";

export interface AuthenticatedClientIdentity {
  authUserId: string;
  githubUserId: string | null;
  githubUsername: string | null;
  userName: string;
  userId: string;
}

interface StoredClientSession {
  id: string;
  identity?: AuthenticatedClientIdentity | null;
  preferences: Record<string, unknown>;
}

export const CLIENT_SESSION_STORAGE_KEY = "notebooks:v2:client-session";
export const CLIENT_SESSION_CHANGE_EVENT = "notebooks:client-session-change";

const EMPTY_PREFERENCES = {
  fileHistory: [],
  preset: "midnight",
  mode: "dark",
  customAccent: "",
  customBackground: "",
};

function isSessionId(value: unknown): value is string {
  return typeof value === "string"
    && /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}

function createSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readStoredSession(): StoredClientSession | null {
  const stored = localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
  if (!stored) return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object") return null;
  const session = candidate as Partial<StoredClientSession>;
  if (!isSessionId(session.id) || !session.preferences || typeof session.preferences !== "object") return null;
  return session as StoredClientSession;
}

function notifyClientSessionChange(): void {
  window.dispatchEvent(new Event(CLIENT_SESSION_CHANGE_EVENT));
}

export function getOrCreateClientSessionId(): string {
  const existing = readStoredSession();
  if (existing) return existing.id;

  const id = createSessionId();
  localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify({
    id,
    preferences: EMPTY_PREFERENCES,
  }));
  notifyClientSessionChange();
  return id;
}

export function setAuthenticatedClientIdentity(identity: AuthenticatedClientIdentity): void {
  const sessionId = getOrCreateClientSessionId();
  const current = readStoredSession();
  localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify({
    id: sessionId,
    preferences: current?.preferences ?? EMPTY_PREFERENCES,
    identity,
  }));
  notifyClientSessionChange();
}

export function clearAuthenticatedClientIdentity(): void {
  const current = readStoredSession();
  if (!current?.identity) return;
  localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify({
    id: current.id,
    preferences: current.preferences,
  }));
  notifyClientSessionChange();
}

export function updateAuthenticatedClientProfile(userId: string, userName: string): void {
  const current = readStoredSession();
  if (!current?.identity) return;
  setAuthenticatedClientIdentity({ ...current.identity, userId, userName });
}

export interface BoundAccountSession {
  authUserId: string;
  userId: string;
  githubUserId: string | null;
  githubUsername: string | null;
  userName: string;
  needsSetup: boolean;
}

export async function bindAuthenticatedClientSession(accessToken: string): Promise<BoundAccountSession> {
  const sessionId = getOrCreateClientSessionId();
  const response = await fetch("/api/account/session", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });
  const result = await response.json() as BoundAccountSession & { error?: string };
  if (!response.ok) throw new Error(result.error || "Unable to link this browser session to your account.");

  setAuthenticatedClientIdentity({
    authUserId: result.authUserId,
    githubUserId: result.githubUserId,
    githubUsername: result.githubUsername,
    userName: result.userName,
    userId: result.userId,
  });
  return result;
}
