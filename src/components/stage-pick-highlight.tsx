"use client";

import { useEffect, useState, type ReactNode } from "react";

// Holds the stage pick/ban card on screen for a beat after the final stage
// is picked (the server keeps rendering it in highlight mode), then hides
// it. State survives StreamRefreshPoller's router.refresh() calls, so the
// timer runs once per pick rather than restarting on every poll.
export function StagePickHighlight({
  autoHide,
  holdMs,
  children,
}: {
  autoHide: boolean;
  holdMs: number;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoHide) return;
    const timer = setTimeout(() => setVisible(false), holdMs);
    return () => clearTimeout(timer);
  }, [autoHide, holdMs]);

  return visible ? children : null;
}
