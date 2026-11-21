"use client";

import { Component, type ReactNode } from "react";

export class InteractiveErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("Interactive chapter reader component failed", error);
  }

  render() {
    if (this.state.failed) {
      return <p className="chapter-reader-error" role="alert">This interactive feature could not be loaded.</p>;
    }
    return this.props.children;
  }
}
