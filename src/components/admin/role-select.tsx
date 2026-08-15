"use client";

import { UserRole } from "@/generated/prisma/enums";

const ROLE_OPTIONS: UserRole[] = [UserRole.USER, UserRole.MOD, UserRole.ADMIN];

// A real <select> rather than a row of buttons (see the 3-button version
// this replaced) — on mobile that meant three tiny side-by-side tap targets
// crammed into a table cell, easy to mis-tap. A native <select> hands off to
// the OS's own picker (iOS wheel, Android modal list), which is properly
// sized for touch without any of that layout squeezing needed here.
export function RoleSelect({ currentRole }: { currentRole: UserRole }) {
  return (
    <select
      name="role"
      defaultValue={currentRole}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="h-8 min-w-20 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring"
    >
      {ROLE_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option.toLowerCase()}
        </option>
      ))}
    </select>
  );
}
