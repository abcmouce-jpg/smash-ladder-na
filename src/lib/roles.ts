// Restricts who can grant/revoke MOD or ADMIN — same pattern as
// SEASON_MANAGER_USER_ID (see src/lib/seasons.ts), but a list rather than a
// single id since more than one trusted person needs to manage staff while
// offline from each other. Comma-separated cuids. If unset, nobody can
// change roles in-app (falls back to direct DB access, today's behavior).
export const ROLE_MANAGER_USER_IDS = (process.env.ROLE_MANAGER_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export function canManageRoles(userId: string) {
  return ROLE_MANAGER_USER_IDS.includes(userId);
}
