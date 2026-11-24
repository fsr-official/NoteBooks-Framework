"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  CHAT_PAGE_SIZE,
  readPublicMessages,
  type ChatRoom,
  type PublicChatMessage,
} from "@/lib/chat/messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const POLL_ACTIVE_MS = 4_000;
const POLL_IDLE_MS = 15_000;
/** After this many empty polls in a row (~1 minute) slow down to POLL_IDLE_MS. */
const IDLE_AFTER_EMPTY_POLLS = 15;
const POLL_MAX_BACKOFF_MS = 30_000;
const MAX_MESSAGES_IN_MEMORY = 300;
const STICK_TO_BOTTOM_PX = 80;

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatRoomView({ room }: { room: ChatRoom }) {
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connectionNote, setConnectionNote] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [sendError, setSendError] = useState("");
  const [unread, setUnread] = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<number | null>(null);
  const knownRef = useRef(new Set<number>());
  const stickRef = useRef(true);
  const loadedRef = useRef(false);
  const emptyPollsRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Add messages to the list. Only messages that came from polling may advance
   * the cursor: advancing it for our own just-posted message could jump over
   * someone else's message that landed a moment earlier.
   */
  const merge = useCallback((incoming: PublicChatMessage[], advanceCursor: boolean) => {
    const fresh = incoming.filter((message) => !knownRef.current.has(message.seq));
    for (const message of fresh) knownRef.current.add(message.seq);
    if (advanceCursor && incoming.length > 0) {
      const latest = Math.max(...incoming.map((message) => message.seq));
      cursorRef.current = Math.max(cursorRef.current ?? 0, latest);
    }
    if (fresh.length === 0) return;
    setMessages((previous) => {
      const next = [...previous, ...fresh].sort((a, b) => a.seq - b.seq);
      return next.length > MAX_MESSAGES_IN_MEMORY ? next.slice(-MAX_MESSAGES_IN_MEMORY) : next;
    });
    if (loadedRef.current && !stickRef.current) setUnread((count) => count + fresh.length);
  }, []);

  // Who is signed in (controls whether the composer is shown).
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      const supabase = getSupabaseBrowserClient();
      void supabase.auth.getSession()
        .then(({ data }) => { if (active) setSignedIn(Boolean(data.session)); })
        .catch(() => { if (active) setSignedIn(false); });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setSignedIn(Boolean(session));
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      queueMicrotask(() => { if (active) setSignedIn(false); });
    }
    return () => { active = false; unsubscribe(); };
  }, []);

  // Polling: adaptive interval, paused while the tab is hidden, backs off on errors.
  useEffect(() => {
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const schedule = (delay: number) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void poll(); }, delay);
    };

    async function poll() {
      if (cancelled || document.hidden) return; // resumed by the visibilitychange handler
      const cursor = cursorRef.current;
      const query = cursor === null ? "" : `?after=${cursor}`;
      let delay: number;
      try {
        const response = await fetch(`/api/chat/${room}/messages${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Chat returned ${response.status}`);
        const data = await response.json() as { messages?: unknown };
        const incoming = readPublicMessages(data.messages);
        failures = 0;
        setConnectionNote("");
        merge(incoming, true);
        if (!loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
        emptyPollsRef.current = incoming.length > 0 ? 0 : emptyPollsRef.current + 1;
        delay = incoming.length >= CHAT_PAGE_SIZE
          ? 300 // a full page means there is more waiting
          : emptyPollsRef.current >= IDLE_AFTER_EMPTY_POLLS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
      } catch {
        if (cancelled) return;
        failures += 1;
        setConnectionNote("Reconnecting…");
        delay = Math.min(POLL_MAX_BACKOFF_MS, POLL_ACTIVE_MS * 2 ** failures);
      }
      schedule(delay);
    }

    const onVisibility = () => {
      if (!document.hidden) {
        emptyPollsRef.current = 0;
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [merge, room]);

  // Keep the newest message in view unless the reader scrolled up.
  useEffect(() => {
    const log = logRef.current;
    if (log && stickRef.current) log.scrollTop = log.scrollHeight;
  }, [messages]);

  useEffect(() => () => {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
  }, []);

  function handleScroll() {
    const log = logRef.current;
    if (!log) return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_TO_BOTTOM_PX;
    stickRef.current = atBottom;
    if (atBottom) setUnread(0);
  }

  function jumpToBottom() {
    const log = logRef.current;
    if (!log) return;
    stickRef.current = true;
    log.scrollTop = log.scrollHeight;
    setUnread(0);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || coolingDown) return;
    setSending(true);
    setSendError("");
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setSignedIn(false);
        setSendError("Your sign-in has expired. Please sign in again.");
        return;
      }
      const response = await fetch(`/api/chat/${room}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
      if (response.status === 201 && body) {
        const [message] = readPublicMessages([body.message]);
        if (message) {
          stickRef.current = true;
          emptyPollsRef.current = 0;
          merge([message], false);
          setDraft("");
          setCoolingDown(true);
          cooldownTimerRef.current = setTimeout(() => setCoolingDown(false), CHAT_COOLDOWN_MS);
          return;
        }
      }
      if (response.status === 429) {
        const wait = Number(response.headers.get("retry-after"));
        setSendError(`Slow down — try again in ${wait > 0 ? `${wait}s` : "a moment"}.`);
        return;
      }
      setSendError(typeof body?.error === "string" ? body.error : "Your message could not be sent.");
    } catch {
      setSendError("Network error. Your message was not sent.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <section className="chat-room" aria-label="Community chat">
      <div
        className="chat-log"
        ref={logRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
      >
        {!loaded && <p className="chat-empty">{connectionNote || "Loading messages…"}</p>}
        {loaded && messages.length === 0 && <p className="chat-empty">No messages yet. Say hello!</p>}
        <ol className="chat-messages">
          {messages.map((message) => (
            <li key={message.seq} className="chat-message">
              <div className="chat-message-meta">
                <strong className="chat-author">{message.userName}</strong>
                <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt)}</time>
              </div>
              <p className="chat-text">{message.text}</p>
            </li>
          ))}
        </ol>
      </div>

      {unread > 0 && (
        <button type="button" className="chat-unread" onClick={jumpToBottom}>
          {unread} new message{unread === 1 ? "" : "s"} ↓
        </button>
      )}
      {loaded && connectionNote && <p className="chat-status" role="status">{connectionNote}</p>}

      {signedIn === false ? (
        <p className="chat-signin">
          <Link href="/login">Sign in</Link> to join the conversation.
        </p>
      ) : (
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <label htmlFor="chat-draft" className="chat-visually-hidden">Message</label>
          <textarea
            id="chat-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={CHAT_MAX_LENGTH}
            rows={2}
            placeholder={signedIn ? "Write a message… (Enter to send, Shift+Enter for a new line)" : "Loading…"}
            disabled={signedIn !== true}
          />
          <div className="chat-composer-row">
            <span className="chat-counter" aria-live="off">{draft.length}/{CHAT_MAX_LENGTH}</span>
            <button type="submit" disabled={signedIn !== true || sending || coolingDown || draft.trim().length === 0}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {sendError && <p className="chat-error" role="alert">{sendError}</p>}
        </form>
      )}
    </section>
  );
}
