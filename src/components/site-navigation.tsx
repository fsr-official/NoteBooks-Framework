"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { STREAMS, type LibraryId } from "@/lib/library-streams";
import { LandingThemePicker } from "@/components/landing-theme-picker";
import { StreamIconGlyph } from "@/components/stream-icon-glyph";

type ActivePage = LibraryId | "home" | "account";

export function SiteNavigation({
  activePage,
  onNavigate,
  navRef,
}: {
  activePage: ActivePage;
  onNavigate?: () => void;
  navRef?: RefObject<HTMLElement | null>;
}) {
  const isHome = activePage === "home";

  return (
    <header className={`topbar stream-topbar ${isHome ? "landing-topbar" : ""}`}>
      <Link className="brand" href="/" aria-label="NoteBooks home" onClick={onNavigate}>
        <span className="brand-mark" aria-hidden="true">n</span>
        <span>NoteBooks</span>
        <span className="brand-tag">STUDY SPACE</span>
      </Link>
      <nav className="top-nav" aria-label="Main navigation" ref={navRef}>
        <Link
          aria-current={isHome ? "page" : undefined}
          className={`nav-link ${isHome ? "active" : ""}`}
          href="/"
          onClick={onNavigate}
        >
          <span className="nav-stream-icon nav-home-icon" aria-hidden="true">n</span>
          <span>Home</span>
        </Link>
        {STREAMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`nav-link ${isActive ? "active" : ""}`}
              href={`/${item.route}`}
              key={item.id}
              onClick={onNavigate}
            >
              <span className={`nav-stream-icon nav-stream-icon-${item.id}`} aria-hidden="true">
                <span className="nav-icon-glyph"><StreamIconGlyph stream={item.id} fallback={item.icon} /></span>
              </span>
              <span>{item.title}</span>
            </Link>
          );
        })}
        {isHome && <LandingThemePicker />}
        <Link
          aria-current={activePage === "account" ? "page" : undefined}
          className={`nav-link auth-nav-link ${activePage === "account" ? "active" : ""}`}
          href="/account"
          onClick={onNavigate}
        >
          Account
        </Link>
        <Link className="nav-link auth-nav-join" href="/register" onClick={onNavigate}>Join</Link>
      </nav>
    </header>
  );
}
