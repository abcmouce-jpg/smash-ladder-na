"use client";

import { useFlashOnChange } from "@/lib/use-flash-on-change";

// Briefly highlights its children whenever `value` changes — for values
// that update via polling (router.refresh(), not a direct user action),
// like the room code the other player just entered. Skips the flash on
// first mount, since that's not a "change" the viewer needs to be alerted to.
export function FlashOnChange({ value, children }: { value: string; children: React.ReactNode }) {
  const flashing = useFlashOnChange(value);

  return (
    <span className={`rounded px-0.5 transition-colors duration-500 ${flashing ? "bg-primary/25" : "bg-transparent"}`}>
      {children}
    </span>
  );
}
