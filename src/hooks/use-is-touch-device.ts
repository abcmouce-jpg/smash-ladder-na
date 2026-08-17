"use client";

import * as React from "react";

function subscribeToCoarsePointerChange(onChange: () => void) {
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getIsCoarsePointer() {
  return window.matchMedia("(pointer: coarse)").matches;
}

export function useIsTouchDevice() {
  return React.useSyncExternalStore(subscribeToCoarsePointerChange, getIsCoarsePointer, () => false);
}
