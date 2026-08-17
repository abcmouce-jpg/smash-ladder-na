"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Comment = {
  id: string;
  author: { username: string; role?: "USER" | "MOD" | "ADMIN" };
  body: string;
  translatedBody?: string | null;
  createdAt: string; // ISO string from server
};

const ROLE_LABEL_CLASS: Record<string, string> = {
  MOD: "text-blue-600 dark:text-blue-400",
  ADMIN: "text-amber-600 dark:text-amber-400",
};

function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function ChatMessages({
  comments,
  empty,
}: {
  comments: Comment[];
  empty: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  // Track whether the user is scrolled near the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      const threshold = 80;
      isNearBottom.current = el!.scrollHeight - el!.scrollTop - el!.clientHeight < threshold;
    }

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll to bottom on new messages if user was near the bottom
  useEffect(() => {
    if (isNearBottom.current && comments.length > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [comments.length]);

  // Scroll to bottom on initial load only — the effect above already
  // handles every later change to comments.length, so re-running this one
  // on the same dependency would just be a redundant duplicate jump.
  useEffect(() => {
    if (comments.length > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {comments.length === 0 ? (
        empty
      ) : (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <ChatMessage key={c.id} comment={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatMessage({ comment }: { comment: Comment }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasTranslation = !!comment.translatedBody && comment.translatedBody !== comment.body;
  const displayBody = hasTranslation && !showOriginal ? comment.translatedBody! : comment.body;

  const roleClass = comment.author.role ? ROLE_LABEL_CLASS[comment.author.role] : undefined;

  return (
    <li className="text-sm leading-relaxed break-words">
      <span className={`font-medium ${roleClass ?? ""}`}>{comment.author.username}</span>
      {roleClass && (
        <span className="ml-1 rounded bg-muted px-1 py-px align-middle text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
          {comment.author.role}
        </span>
      )}
      :{" "}
      <span className="whitespace-pre-wrap">{displayBody}</span>
      <span className="ml-1.5 whitespace-nowrap text-[10px] text-muted-foreground/60">
        {formatTime(comment.createdAt)}
      </span>
      {hasTranslation && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="ml-1.5 cursor-pointer align-baseline text-[10px] whitespace-nowrap text-muted-foreground/60 underline-offset-2 hover:text-muted-foreground hover:underline"
        >
          {showOriginal ? "translated" : "original"}
        </button>
      )}
    </li>
  );
}
