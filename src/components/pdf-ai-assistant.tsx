"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AI_TIERS, isAiTier, type AiTier } from "@/lib/ai-tiers";
import { renderChatMarkdown } from "@/lib/markdown/chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type PdfChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  tier?: AiTier;
};

const CHAT_CONSENT_KEY = "notebooks:ai-chat:consent:v1";
const AI_TIER_PREFERENCE_KEY = "notebooks:reader:ai-tier:v1";
const VISITOR_ID_KEY = "notebooks:ai-chat:visitor-id";
const CHAT_STORAGE_PREFIX = "notebooks:reader-chat:v1:";

function readChatConsent(): boolean {
  try {
    return localStorage.getItem(CHAT_CONSENT_KEY) === "accepted";
  } catch (error) {
    console.error("Could not read the AI chat policy acceptance", error);
    return false;
  }
}

function readAiTierPreference(): AiTier {
  try {
    const saved = localStorage.getItem(AI_TIER_PREFERENCE_KEY);
    return isAiTier(saved) ? saved : "low";
  } catch (error) {
    console.error("Could not read the AI effort preference", error);
    return "low";
  }
}

function readChatMessages(key: string): PdfChatMessage[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((message): message is PdfChatMessage => (
      Boolean(message)
      && typeof message === "object"
      && typeof message.id === "string"
      && (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string"
      && message.content.length <= 8000
      && (message.tier === undefined || isAiTier(message.tier))
      && (message.model === undefined
        || (typeof message.model === "string" && /^[A-Za-z0-9._/-]{1,100}$/.test(message.model)))
    )).slice(-30);
  } catch (error) {
    console.error("Could not read the saved PDF assistant chat", error);
    return [];
  }
}

function pageText(content: { items?: unknown[] }): string {
  if (!content || typeof content !== "object" || !("items" in content) || !Array.isArray(content.items)) return "";
  return content.items
    .map((item) => item && typeof item === "object" && "str" in item && typeof item.str === "string" ? item.str : "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function PdfAiAssistant({
  document,
  fileName,
  fileKey,
  pageMode,
  pageNumber,
}: {
  document: PDFDocumentProxy | null;
  fileName: string;
  fileKey: string;
  pageMode: "single" | "dual";
  pageNumber: number;
}) {
  const storageKey = useMemo(() => `${CHAT_STORAGE_PREFIX}${fileKey}`, [fileKey]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PdfChatMessage[]>(() => readChatMessages(storageKey));
  const [loadedKey] = useState(storageKey);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(readChatConsent);
  const [usageChecked, setUsageChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [tier, setTier] = useState<AiTier>(readAiTierPreference);
  const [webSearch, setWebSearch] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      if (messages.length) localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
      else localStorage.removeItem(storageKey);
    } catch (error) {
      console.error("Could not save PDF assistant chat locally", error);
    }
  }, [loadedKey, messages, storageKey]);

  useEffect(() => {
    if (!open) return;
    const updateSelection = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const focus = selection?.focusNode;
      const viewport = window.document.getElementById("pdf-page-viewport");
      if (!selection || selection.isCollapsed || !anchor || !focus
          || !viewport?.contains(anchor) || !viewport.contains(focus)) return;
      const text = selection.toString().trim();
      if (text) setSelectedText(text.slice(0, 6000));
    };
    window.document.addEventListener("selectionchange", updateSelection);
    return () => window.document.removeEventListener("selectionchange", updateSelection);
  }, [document, open]);

  useEffect(() => {
    if (!open || !messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, open, pending]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || pending) return;
    if (!accepted) {
      setNotice("Accept the AI usage and privacy policies before chatting.");
      return;
    }

    setPending(true);
    setNotice("");
    const previousMessages = messages.slice(-6).map(({ role, content }) => ({
      role,
      content: content.slice(0, 2000),
    }));
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user" as const, content: message }].slice(-30));
    setDraft("");

    try {
      let visitorId = "";
      try {
        visitorId = localStorage.getItem(VISITOR_ID_KEY) ?? "";
      } catch (error) {
        console.error("Could not read the AI chat visitor ID", error);
      }
      if (!/^[0-9a-f-]{36}$/i.test(visitorId)) visitorId = crypto.randomUUID();
      try {
        localStorage.setItem(VISITOR_ID_KEY, visitorId);
      } catch (error) {
        console.error("Could not save the AI chat visitor ID", error);
      }

      const { data: sessionData, error: sessionError } = await getSupabaseBrowserClient().auth.getSession();
      if (sessionError) throw sessionError;
      if (tier !== "low" && !sessionData.session) {
        throw new Error("Sign in to use Medium, High, or Extra AI effort. Low is available without an account.");
      }

      const pages = Array.from(new Set([
        pageNumber,
        ...(pageMode === "dual" && pageNumber < (document?.numPages ?? pageNumber) ? [pageNumber + 1] : []),
      ]));
      const context = selectedText
        ? [{ title: "Selected PDF text", text: selectedText }]
        : await Promise.all(pages.map(async (page) => {
          if (!document) return { title: `PDF page ${page}`, text: "" };
          const text = pageText(await (await document.getPage(page)).getTextContent()).slice(0, 5000);
          return { title: `PDF page ${page}`, text };
        }));
      if (!context.some(({ text }) => text.trim())) {
        setNotice("No selectable text was found on the current PDF page. Select text or ask a general question.");
      }
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          ...(sessionData.session ? { authorization: `Bearer ${sessionData.session.access_token}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          context,
          history: previousMessages,
          tier,
          message,
          noteTitle: `${fileName} (PDF)`,
          visitorId,
          webSearch,
        }),
      });
      const result = await response.json() as {
        answer?: string;
        model?: string;
        tier?: string;
        error?: string;
      };
      const answer = result.answer;
      const model = result.model;
      if (!response.ok || typeof answer !== "string" || !answer
          || typeof model !== "string" || !/^[A-Za-z0-9._/-]{1,100}$/.test(model)) {
        throw new Error(result.error || "The AI service could not answer this question.");
      }
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: answer,
        model,
        tier: isAiTier(result.tier) ? result.tier : tier,
      }].slice(-30));
      setSelectedText("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The AI service could not answer this question.");
    } finally {
      setPending(false);
    }
  }

  function acceptPolicies() {
    if (!usageChecked || !privacyChecked) return;
    try {
      localStorage.setItem(CHAT_CONSENT_KEY, "accepted");
    } catch (error) {
      console.error("Could not save AI policy acceptance", error);
      setNotice("Policy acceptance could not be saved in this browser. You can continue for this visit.");
    }
    setAccepted(true);
  }

  return (
    <div className={`pdf-assistant${open ? " is-open" : ""}`}>
      {open && (
        <section className="pdf-assistant-panel" aria-label="PDF NoteBooks AI Assistant">
          <header className="pdf-assistant-header">
            <span className="pdf-assistant-mark" aria-hidden="true">n</span>
            <div><strong>NoteBooks AI Assistant</strong><small>Reading {fileName}</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close AI Assistant">×</button>
          </header>
          <div className="pdf-assistant-messages" ref={messagesRef} aria-live="polite">
            {!accepted ? (
              <div className="pdf-assistant-consent">
                <strong>Before you chat</strong>
                <p>Your question and relevant PDF text will be sent to our AI provider. Please review and accept both policies.</p>
                <label><input type="checkbox" checked={usageChecked} onChange={(event) => setUsageChecked(event.currentTarget.checked)} /> I agree to the <a href="/ai-usage-policy" target="_blank" rel="noreferrer">AI Usage Policy</a>.</label>
                <label><input type="checkbox" checked={privacyChecked} onChange={(event) => setPrivacyChecked(event.currentTarget.checked)} /> I agree to the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</label>
                <button type="button" disabled={!usageChecked || !privacyChecked} onClick={acceptPolicies}>Accept and continue</button>
              </div>
            ) : (
              <>
                {!messages.length && <p className="pdf-assistant-welcome">Ask about this PDF. I’ll use text from the page you’re viewing.</p>}
                {messages.map((item) => (
                  <article className={`pdf-assistant-message is-${item.role}`} key={item.id}>
                    <strong>{item.role === "user" ? "You" : "NoteBooks AI"}{item.role === "assistant" && item.model ? ` · ${item.model}` : ""}</strong>
                    {item.role === "assistant"
                      ? <div className="pdf-assistant-markdown" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(item.content) }} />
                      : <p>{item.content}</p>}
                    {item.role === "assistant" && item.tier && <small>{AI_TIERS[item.tier].label} effort</small>}
                  </article>
                ))}
                {pending && <p className="pdf-assistant-pending"><span className="pdf-assistant-spinner" /> Reading and answering…</p>}
              </>
            )}
          </div>
          {accepted && (
            <form className="pdf-assistant-form" onSubmit={(event) => void sendMessage(event)}>
              {selectedText && <div className="pdf-assistant-selection"><span>Using selected PDF text</span><button type="button" onClick={() => setSelectedText("")} aria-label="Remove selected text">×</button></div>}
              <label className="pdf-assistant-tier">Effort
                <select
                  value={tier}
                  onChange={(event) => {
                    if (isAiTier(event.currentTarget.value)) {
                      setTier(event.currentTarget.value);
                      try {
                        localStorage.setItem(AI_TIER_PREFERENCE_KEY, event.currentTarget.value);
                      } catch (error) {
                        console.error("Could not save the AI effort preference", error);
                      }
                    }
                  }}
                >
                  {Object.entries(AI_TIERS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
                </select>
              </label>
              <label className="pdf-assistant-web"><input type="checkbox" checked={webSearch} onChange={(event) => setWebSearch(event.currentTarget.checked)} /> Web search</label>
              <div className="pdf-assistant-input-row">
                <textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} maxLength={4000} placeholder="Ask about this PDF…" aria-label="Ask the PDF assistant" />
                <button type="submit" disabled={!draft.trim() || pending}>Send</button>
              </div>
              {notice && <p className="pdf-assistant-notice" role="status">{notice}</p>}
              <small className="pdf-assistant-disclaimer">AI can make mistakes. Check important information against the source.</small>
            </form>
          )}
        </section>
      )}
      <button
        className="pdf-assistant-launcher"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Close NoteBooks AI Assistant" : "Open NoteBooks AI Assistant"}
        title="NoteBooks AI Assistant"
      >
        <span aria-hidden="true">n</span><span>{open ? "Close" : "AI"}</span>
      </button>
    </div>
  );
}
