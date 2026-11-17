import type { Metadata } from "next";
import "./notebooks.css";
import "./reader-redesign.css";
import "katex/dist/katex.min.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeBootstrap } from "@/components/theme-bootstrap";

export const metadata: Metadata = {
  title: "NoteBooks — A calmer place to study",
  description: "Browse a growing library of clear, structured learning resources.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ThemeBootstrap />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
