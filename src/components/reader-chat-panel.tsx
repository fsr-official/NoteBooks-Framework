"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AI_TIERS, isAiTier, type AiTier } from "@/lib/ai-tiers";
import { renderChatMarkdown } from "@/lib/markdown/chat";
import type { NoteSearchBlock, NoteSection } from "@/lib/markdown/renderer";
import { READER_CHAT_STORAGE_PREFIX } from "@/lib/reader-chat-storage";
import type { ReaderFile } from "@/lib/reader-types";

type ReaderChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tier?: AiTier;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
};

export type ReaderChatPanelProps = {
  file: ReaderFile;
  searchIndex: NoteSearchBlock[];
  tree: NoteSection[];
  activeSectionId: string;
  activeSectionTitle: string | undefined;
  contentElement: HTMLElement | null;
  expanded: boolean;
  aiTier: AiTier;
  onAiTierChange: (tier: AiTier) => void;
};

const CHAT_CONSENT_KEY = "notebooks:ai-chat:consent:v1";
const CHAT_WELCOME_LINES = [
  "Hi, I’m your NoteBooks study companion. Ask me to explain an idea or connect it to this note.",
  "Welcome! I’m ready to help you explore this note, one question at a time.",
  "Let’s make this topic clearer. What would you like to understand first?",
] as const;

function getChatStorageKey(file: ReaderFile): string {
  return `${READER_CHAT_STORAGE_PREFIX}${file.owner}/${file.repository}/${file.path}`;
}

function getChatWelcomeLine(storageKey: string): string {
  const hash = Array.from(storageKey).reduce((total, character) => total + character.charCodeAt(0), 0);
  return CHAT_WELCOME_LINES[hash % CHAT_WELCOME_LINES.length];
}

function readChatMessages(storageKey: string): ReaderChatMessage[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ReaderChatMessage => (
      Boolean(item)
      && typeof item === "object"
      && typeof item.id === "string"
      && (item.role === "user" || item.role === "assistant")
      && typeof item.content === "string"
      && item.content.length <= 8000
      && (item.tier === undefined || isAiTier(item.tier))
      && (item.model === undefined
        || (typeof item.model === "string" && /^[A-Za-z0-9._/-]{1,100}$/.test(item.model)))
      && (item.promptTokens === undefined
        || (typeof item.promptTokens === "number" && Number.isSafeInteger(item.promptTokens) && item.promptTokens >= 0))
      && (item.completionTokens === undefined
        || (typeof item.completionTokens === "number" && Number.isSafeInteger(item.completionTokens) && item.completionTokens >= 0))
    )).slice(-30);
  } catch (error) {
    console.error("Could not read the saved reader chat", error);
    return [];
  }
}

export function ReaderChatPanel({
  file,
  searchIndex,
  tree,
  activeSectionId,
  activeSectionTitle,
  contentElement,
  expanded,
  aiTier,
  onAiTierChange,
}: ReaderChatPanelProps) {
  const chatStorageKey = getChatStorageKey(file);
  const [messageDraft, setMessageDraft] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatMessages, setChatMessages] = useState<ReaderChatMessage[]>(() => (
    typeof window === "undefined" ? [] : readChatMessages(chatStorageKey)
  ));
  const [chatPending, setChatPending] = useState(false);
  const [selectedChatText, setSelectedChatText] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [chatActionsOpen, setChatActionsOpen] = useState(false);
  const [chatPoliciesAccepted, setChatPoliciesAccepted] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(CHAT_CONSENT_KEY) === "accepted";
    } catch (error) {
      console.error("Could not read the AI chat policy acceptance", error);
      return false;
    }
  });
  const [usagePolicyChecked, setUsagePolicyChecked] = useState(false);
  const [privacyPolicyChecked, setPrivacyPolicyChecked] = useState(false);
  const [welcomeText, setWelcomeText] = useState("");
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);
  const visitorIdRef = useRef("");
  const chatWelcomeLine = getChatWelcomeLine(chatStorageKey);
  const renderedMessages = useMemo(() => chatMessages.map((message) => ({
    message,
    html: renderChatMarkdown(message.content),
  })), [chatMessages]);
  const hasMath = renderedMessages.some(({ html }) => html.includes('class="katex'));

  useEffect(() => {
    if (chatMessages.length > 0) return;
    let position = 0;
    const timer = window.setInterval(() => {
      position = Math.min(position + 2, chatWelcomeLine.length);
      setWelcomeText(chatWelcomeLine.slice(0, position));
      if (position === chatWelcomeLine.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [chatMessages.length, chatStorageKey, chatWelcomeLine]);

  useEffect(() => {
    if (!contentElement) return;
    const updateSelection = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const focus = selection?.focusNode;
      if (!selection || selection.isCollapsed
          || !anchor || !focus
          || !contentElement.contains(anchor)
          || !contentElement.contains(focus)) {
        return;
      }
      const text = selection.toString().trim();
      if (text) setSelectedChatText(text.slice(0, 8000));
    };
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, [contentElement]);

  useEffect(() => {
    try {
      if (chatMessages.length === 0) localStorage.removeItem(chatStorageKey);
      else localStorage.setItem(chatStorageKey, JSON.stringify(chatMessages.slice(-30)));
    } catch (error) {
      console.error("Could not save the reader chat locally", error);
    }
  }, [chatMessages, chatStorageKey]);

  useEffect(() => {
    if (!hasMath) return;
    let active = true;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void import("katex/dist/katex.min.css").catch((error: unknown) => {
          if (!active) return;
          console.error("Could not load chat math styles", error);
          setChatNotice("Some equations could not be styled in chat.");
        });
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [hasMath]);

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = messageDraft.trim();
    if (!message || chatPending) return;
    if (!chatPoliciesAccepted) {
      setChatNotice("Accept the AI usage and privacy policies before chatting.");
      return;
    }

    setChatPending(true);
    setChatNotice("");
    const userMessage: ReaderChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    const priorMessages = chatMessages.slice(-6).map(({ role, content }) => ({
      role,
      content: content.slice(0, 2000),
    }));
    setChatMessages((current) => [...current, userMessage].slice(-30));
    setMessageDraft("");
    try {
      let visitorId = visitorIdRef.current;
      try {
        visitorId = localStorage.getItem("notebooks:ai-chat:visitor-id") ?? visitorId;
      } catch (error) {
        console.error("Could not read the AI chat visitor ID", error);
      }
      if (!/^[0-9a-f-]{36}$/i.test(visitorId)) visitorId = crypto.randomUUID();
      visitorIdRef.current = visitorId;
      try {
        localStorage.setItem("notebooks:ai-chat:visitor-id", visitorId);
      } catch (error) {
        console.error("Could not save the AI chat visitor ID", error);
      }

      const [{ getSupabaseBrowserClient }, { getRelevantNoteContext }] = await Promise.all([
        import("@/lib/supabase/browser"),
        import("@/lib/reader-ai-context"),
      ]);
      const { data: sessionData, error: sessionError } = await getSupabaseBrowserClient().auth.getSession();
      if (sessionError) throw sessionError;
      if (aiTier !== "low" && !sessionData.session) {
        throw new Error("Sign in to use Medium, High, or Extra AI effort. Low is available without an account.");
      }
      const context = getRelevantNoteContext(message, searchIndex, tree, activeSectionId, selectedChatText);
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          ...(sessionData.session
            ? { authorization: `Bearer ${sessionData.session.access_token}` }
            : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          context,
          history: priorMessages,
          tier: aiTier,
          message,
          noteTitle: `${file.fileName} (${file.repository}/${file.path})`,
          visitorId,
          webSearch: webSearchEnabled,
        }),
      });
      const result = await response.json() as {
        answer?: string;
        model?: string;
        tier?: string;
        usage?: { promptTokens?: number; completionTokens?: number; requestsRemaining?: number };
        error?: string;
      };
      const answer = typeof result.answer === "string" ? result.answer : "";
      const model = typeof result.model === "string" ? result.model : "";
      if (!response.ok || !answer || !/^[A-Za-z0-9._/-]{1,100}$/.test(model)) {
        throw new Error(result.error || "The AI service could not answer this question.");
      }
      setChatMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: answer,
        tier: isAiTier(result.tier) ? result.tier : aiTier,
        model,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
      }].slice(-30));
      if (typeof result.usage?.requestsRemaining === "number") {
        setRequestsRemaining(result.usage.requestsRemaining);
      }
      setSelectedChatText("");
    } catch (error) {
      setChatNotice(error instanceof Error ? error.message : "The AI service could not answer this question.");
    } finally {
      setChatPending(false);
    }
  }

  function acceptChatPolicies() {
    if (!usagePolicyChecked || !privacyPolicyChecked) return;
    try {
      localStorage.setItem(CHAT_CONSENT_KEY, "accepted");
    } catch (error) {
      console.error("Could not save the AI chat policy acceptance", error);
      setChatNotice("Policy acceptance could not be saved in this browser. You can continue for this visit.");
    }
    setChatPoliciesAccepted(true);
  }

  return (
    <aside className={`next-reader-ai${expanded ? " chat-expanded" : ""}`} aria-label="Chat">
      <div className="ai-panel-content">
        <header className="reader-chat-header">
          <span className="reader-chat-brand-mark" aria-hidden="true">n</span>
          <div>
            <h2>NoteBooks AI Assistant</h2>
            <p>Study companion · grounded in this note</p>
          </div>
        </header>
        <div className="reader-chat-messages" role="log" aria-live="polite">
          {!chatPoliciesAccepted && (
            <section className="reader-chat-consent" aria-labelledby="reader-chat-consent-title">
              <span className="reader-chat-consent-mark" aria-hidden="true">n</span>
              <h3 id="reader-chat-consent-title">A quick note before we begin</h3>
              <p>Your question, recent chat messages, and relevant note excerpts will be sent to Groq to generate an answer. Chat history stays in this browser.</p>
              <label>
                <input type="checkbox" checked={usagePolicyChecked} onChange={(event) => setUsagePolicyChecked(event.target.checked)} />
                I agree to the <Link href="/ai-usage-policy" target="_blank" rel="noreferrer">AI Usage Policy</Link>.
              </label>
              <label>
                <input type="checkbox" checked={privacyPolicyChecked} onChange={(event) => setPrivacyPolicyChecked(event.target.checked)} />
                I agree to the <Link href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.
              </label>
              <button type="button" onClick={acceptChatPolicies} disabled={!usagePolicyChecked || !privacyPolicyChecked}>
                Agree and continue
              </button>
            </section>
          )}
          {chatMessages.length === 0 && (
            <div className="reader-chat-welcome">
              <span className="reader-chat-avatar" aria-hidden="true">n</span>
              <div>
                <strong>NoteBooks AI</strong>
                <p>{welcomeText}<span className="reader-chat-caret" aria-hidden="true">▋</span></p>
              </div>
              <div className="reader-chat-starters" aria-label="Conversation starters">
                {["Explain the key idea", "Give me a quick summary", "Quiz me on this note"].map((starter) => (
                  <button key={starter} type="button" onClick={() => setMessageDraft(starter)}>{starter}</button>
                ))}
              </div>
            </div>
          )}
          {renderedMessages.map(({ message: chatMessage, html }) => (
            <article className={`reader-chat-message is-${chatMessage.role}`} key={chatMessage.id}>
              <strong>
                {chatMessage.role === "assistant" && <span className="reader-chat-avatar is-small" aria-hidden="true">n</span>}
                {chatMessage.role === "user" ? "You" : "NoteBooks AI"}
              </strong>
              <div className="reader-chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />
              {chatMessage.role === "assistant" && (
                <small className="reader-chat-message-meta">
                  <span>
                    {chatMessage.tier ? `${AI_TIERS[chatMessage.tier].label} · ` : ""}
                    {chatMessage.model ? `Model: ${chatMessage.model}` : "Model info unavailable for this saved reply"}
                  </span>
                  {chatMessage.promptTokens !== undefined && chatMessage.completionTokens !== undefined
                    && <span>{(chatMessage.promptTokens + chatMessage.completionTokens).toLocaleString()} tokens</span>}
                </small>
              )}
            </article>
          ))}
          {chatPending && (
            <div className="reader-chat-pending" role="status">
              <span className="reader-chat-avatar is-typing" aria-hidden="true">n</span>
              <span>NoteBooks AI is reading and writing</span>
              <span className="reader-chat-typing-dots" aria-hidden="true"><i /><i /><i /></span>
            </div>
          )}
          {requestsRemaining !== null && requestsRemaining <= 3 && (
            <p className="reader-chat-usage-warning" role="status">
              {requestsRemaining === 0
                ? "You’re at the limit for your current AI chat allowance."
                : `You have ${requestsRemaining} AI chat ${requestsRemaining === 1 ? "request" : "requests"} left in your current allowance.`}
            </p>
          )}
        </div>
        <form className="reader-chat-composer" onSubmit={(event) => void sendChatMessage(event)}>
          <div className="reader-chat-tier-control">
            <label htmlFor="reader-chat-tier">AI effort</label>
            <select
              id="reader-chat-tier"
              aria-label="AI effort and token ceiling"
              value={aiTier}
              onChange={(event) => {
                if (isAiTier(event.target.value)) onAiTierChange(event.target.value);
              }}
              disabled={chatPending}
            >
              {Object.entries(AI_TIERS).map(([tier, option]) => (
                <option key={tier} value={tier}>{option.label}</option>
              ))}
            </select>
            <p>
              Up to {AI_TIERS[aiTier].maxOutputTokens.toLocaleString()} answer tokens;
              input is fitted to about {AI_TIERS[aiTier].maxInputTokens.toLocaleString()} tokens.
              {aiTier !== "low" && " Sign-in required."}
            </p>
          </div>
          {selectedChatText && (
            <p className="reader-chat-selection">
              <span><b>#Selected-Text</b> · {selectedChatText.length.toLocaleString()} characters</span>
              <button type="button" onClick={() => setSelectedChatText("")} aria-label="Remove selected text">×</button>
            </p>
          )}
          <div className="reader-chat-input-shell">
            <textarea
              id="reader-chat-message"
              aria-label="Message"
              value={messageDraft}
              onChange={(event) => {
                setMessageDraft(event.target.value);
                setChatNotice("");
              }}
              placeholder="Ask anything about this note…"
              rows={4}
              maxLength={4000}
              disabled={chatPending}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="reader-chat-input-actions">
              <span className="reader-chat-shortcut">Enter to send · Shift + Enter for a new line</span>
              <button type="submit" className="reader-chat-send-button" aria-label={chatPending ? "Sending message" : "Send message"} disabled={!messageDraft.trim() || chatPending || !chatPoliciesAccepted}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path d="M4.5 12 20 4l-4.1 16-3.1-6.2L4.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="m12.8 13.8 7.2-9.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <div className="reader-chat-action-wrap">
                <button type="button" className="reader-chat-add-button" aria-label="More chat actions" aria-haspopup="menu" aria-expanded={chatActionsOpen} onClick={() => setChatActionsOpen((open) => !open)} disabled={chatPending}>
                  +
                </button>
                {chatActionsOpen && (
                  <div className="reader-chat-action-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => {
                      setChatNotice(selectedChatText ? "" : "Select text in the note to attach it.");
                      setChatActionsOpen(false);
                    }}>{selectedChatText ? "Selected text attached" : "Attach selected text"}</button>
                    <button type="button" role="menuitem" onClick={() => {
                      setMessageDraft(`Explain this section: ${activeSectionTitle ?? file.fileName}`);
                      setChatActionsOpen(false);
                    }}>Explain this section</button>
                    <button type="button" role="menuitem" onClick={() => {
                      setMessageDraft(`Summarize this section: ${activeSectionTitle ?? file.fileName}`);
                      setChatActionsOpen(false);
                    }}>Summarize this section</button>
                    <button type="button" role="menuitemcheckbox" aria-checked={webSearchEnabled} onClick={() => {
                      setWebSearchEnabled((enabled) => !enabled);
                      setChatActionsOpen(false);
                    }}>{webSearchEnabled ? "✓ Web search on" : "Search the web"}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="reader-chat-disclaimer">
            AI can make mistakes. Check important information against the note and trusted sources.
          </p>
          {chatNotice && <p className="reader-chat-notice" role="status">{chatNotice}</p>}
        </form>
      </div>
    </aside>
  );
}
