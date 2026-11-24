import "@/app/workspace-styles";
import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main className="ai-policy-page">
      <Link href="/" className="ai-policy-back">← Back to NoteBooks</Link>
      <p className="ai-policy-eyebrow">NOTEBOOKS AI ASSISTANT</p>
      <h1>Privacy Policy</h1>
      <p>This page describes how information is handled when you use the NoteBooks AI Assistant. Other NoteBooks features may process information under their own flows.</p>
      <h2>Information sent to the AI service</h2>
      <p>Your question, up to six recent messages, the note title, and relevant note excerpts (including text you explicitly select) are sent to our server and then to Groq to generate an answer. If you enable web search, the provider may also use an external search service. Do not send information you are not comfortable sharing with these services.</p>
      <h2>Chat history and account usage</h2>
      <p>Chat conversations are saved in local storage in your current browser and are not saved to NoteBooks chat servers. You can clear saved conversations from Account settings; clearing browser storage also removes them. Signed-in AI usage records include request and token counts, model, and internal request metadata, but not your prompts or answers. Anonymous rate limiting uses hashed IP and browser identifiers; the identifiers are used to enforce request limits.</p>
      <h2>Community chat</h2>
      <p>Messages you post in the community chat are stored on our servers (in Upstash Redis), are visible to anyone who opens the chat, and are shown with your User Name (they are also stored with an internal account identifier so abuse can be moderated). Only the most recent 500 messages per room are kept, and a room is deleted after 30 days without new messages. Posting uses hashed account identifiers for rate limiting. Do not post personal or private information. This is separate from the AI Assistant, whose conversations stay in your browser.</p>
      <h2>Your choices</h2>
      <p>You can choose whether to enable web search, avoid sending sensitive information, and clear locally saved chat history in Account settings. AI features are optional. If you do not accept this policy, do not send messages to the assistant.</p>
      <p>For more detail about appropriate use, see the <Link href="/ai-usage-policy">AI Usage Policy</Link>.</p>
    </main>
  );
}
