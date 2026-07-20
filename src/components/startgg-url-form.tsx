"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type StartggUrlState = { error: string | null };

export function StartggUrlForm({
  action,
  defaultValue,
  label,
  description,
  required = false,
  placeholder = "https://www.start.gg/user/...",
}: {
  action: (prevState: StartggUrlState, formData: FormData) => Promise<StartggUrlState>;
  defaultValue: string;
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {label}
          {description && (
            <span className="text-xs font-normal text-muted-foreground">{description}</span>
          )}
          <input
            name="startggUrl"
            type="url"
            required={required}
            defaultValue={defaultValue}
            placeholder={placeholder}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </label>
        <Button type="submit" size="sm" disabled={isPending}>
          Save
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
