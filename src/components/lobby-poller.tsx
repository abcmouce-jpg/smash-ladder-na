"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { playMatchFoundChime } from "@/lib/sound";

export function LobbyPoller({ matched }: { matched: boolean }) {
  const router = useRouter();
  const wasMatched = useRef(matched);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (matched && !wasMatched.current) playMatchFoundChime();
    wasMatched.current = matched;
  }, [matched]);

  return null;
}
