"use client";

import * as React from "react";

// Server-rendered pages don't know the visitor's timezone, so components that
// use this render with the server snapshot (null → the caller's fallback,
// usually "UTC") for the first paint — identical to SSR, so no hydration
// mismatch — and React swaps in the browser's real IANA timezone during the
// post-hydration re-render, via useSyncExternalStore rather than a
// setState-in-effect (which would cascade a second render).
const subscribe = () => () => {};

export function useBrowserTimeZone(): string | null {
  return React.useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}
