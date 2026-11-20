import "@/app/workspace-styles";
import Link from "next/link";

export default function AiUsagePolicyPage() {
  return (
    <main className="ai-policy-page">
      <Link href="/" className="ai-policy-back">← Back to NoteBooks</Link>
      <p className="ai-policy-eyebrow">NOTEBOOKS AI ASSISTANT</p>
      <h1>AI Usage Policy</h1>
      <p>NoteBooks AI is a study aid that can help explain and summarize material in the note you are reading. It is not a substitute for your own judgment, a teacher, or professional advice.</p>
      <h2>How to use it</h2>
      <ul>
        <li>Review AI answers against your notes and reliable sources; the assistant can make mistakes or omit important details.</li>
        <li>Do not rely on it for medical, legal, financial, safety-critical, or other high-stakes decisions.</li>
        <li>Do not submit passwords, API keys, private personal information, or material you are not allowed to share.</li>
        <li>When web search is enabled, answers may use external search results. Check citations and source quality yourself.</li>
      </ul>
      <h2>What is sent</h2>
      <p>When you send a message, the question, up to six recent messages, the note title, and relevant note excerpts (including text you select) are sent to Groq to generate a response. Web search is optional. Read the <Link href="/privacy">Privacy Policy</Link> for details about processing and storage.</p>
      <p>By continuing to use the assistant, you agree to use it responsibly under this policy.</p>
    </main>
  );
}
