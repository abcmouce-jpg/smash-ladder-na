/**
 * The arena code the player brought to their last queue, remembered on this
 * device.
 *
 * Deliberately browser storage rather than a column on User: which arena is
 * open is a fact about the Switch sitting in front of this browser, not about
 * the account, so a player queueing from their phone should not inherit the
 * code from the setup at home. The practice-mode checkbox beside it is kept
 * the same way for the same reason.
 *
 * Both of the places a player can type a room code read and write it through
 * here rather than naming the key themselves — two copies of a storage key is
 * how the join form and the in-queue form would end up remembering different
 * arenas.
 */
const ROOM_CODE_KEY = "smashLadderRoomCode";

/** Empty string when there is nothing stored, or when storage is unavailable. */
export function readLastRoomCode(): string {
  try {
    return localStorage.getItem(ROOM_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Empty clears it: a player who wipes the field has told us the arena is
 * gone, and keeping it would hand them back the dead code next time.
 */
export function writeLastRoomCode(value: string) {
  try {
    if (value) localStorage.setItem(ROOM_CODE_KEY, value);
    else localStorage.removeItem(ROOM_CODE_KEY);
  } catch {
    /* localStorage unavailable */
  }
}
