import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Manrope } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeBootstrap } from "@/components/theme-bootstrap";
import { SpeedInsights } from "@vercel/speed-insights/next";

const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans", display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap", preload: false });

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
      <body className={`${dmMono.variable} ${dmSans.variable} ${manrope.variable}`}>
        <ThemeBootstrap />
        {children}
        <ServiceWorkerRegistration />
        {process.env.VERCEL === "1" && <SpeedInsights />}
      </body>
    </html>
  );
}
