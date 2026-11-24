import "@/app/workspace-styles";
import "./chat.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ChatRoomView } from "@/components/chat-room";

export const metadata: Metadata = {
  title: "Community chat — NoteBooks",
  description: "Chat with other NoteBooks readers.",
};

export default function ChatPage() {
  return (
    <main className="chat-page">
      <Link href="/" className="ai-policy-back">← Back to NoteBooks</Link>
      <p className="ai-policy-eyebrow">COMMUNITY</p>
      <h1>Community chat</h1>
      <p className="chat-intro">
        Talk with other readers. Anyone can read; sign in to post. Messages are public, show your User Name,
        and only the latest 500 are kept. See the <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <ChatRoomView room="global" />
    </main>
  );
}
