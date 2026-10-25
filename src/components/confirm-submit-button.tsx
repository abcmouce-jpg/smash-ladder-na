"use client";

import { useRef, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import type { VariantProps } from "class-variance-authority";
import type { Lang } from "@/lib/lang";

type BoundAction = (formData: FormData) => Promise<void> | void;

// Wraps a single-button form with a styled confirmation modal before
// submitting — for actions that are easy to fat-finger (a stage strike, a
// won/lost report) and consequential enough that a stray tap shouldn't just
// go through silently. Needs to be a Client Component since Server
// Components can't attach onSubmit at all, even to a plain <form>.
export function ConfirmSubmitButton({
  action,
  confirmMessage,
  children,
  disabled,
  variant,
  size,
  lang = "en",
}: {
  action: BoundAction;
  confirmMessage: string;
  children: ReactNode;
  disabled?: boolean;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  lang?: Lang;
}) {
  const [confirm, confirmDialog] = useConfirm(lang);
  const confirmReadyRef = useRef(false);

  return (
    <>
      <form
        action={action}
        onSubmit={(e) => {
          if (confirmReadyRef.current) {
            confirmReadyRef.current = false;
            return;
          }
          e.preventDefault();
          // Captured now, not read off `e` in the .then() below — React nulls
          // out a SyntheticEvent's currentTarget once the synchronous handler
          // dispatch finishes, and confirm() resolves asynchronously.
          const form = e.currentTarget;
          confirm(confirmMessage).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" variant={variant} size={size} disabled={disabled}>
          {children}
        </Button>
      </form>
      {confirmDialog}
    </>
  );
}
