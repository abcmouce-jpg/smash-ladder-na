"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setUserStartggUrl, setUsername } from "@/lib/account";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function updateUsername(username: string) {
  const userId = await requireUserId();
  await setUsername(userId, username);
  revalidatePath("/settings");
  revalidatePath(`/players/${userId}`);
  revalidatePath("/leaderboard");
}

export type StartggUrlState = { error: string | null };

// (prevState, formData) shape so useActionState can drive it — a plain
// thrown error (e.g. pasting a non-start.gg link) would otherwise crash to
// Next's generic error overlay instead of showing an inline message.
export async function updateStartggUrl(
  _prevState: StartggUrlState,
  formData: FormData,
): Promise<StartggUrlState> {
  const userId = await requireUserId();
  try {
    await setUserStartggUrl(userId, String(formData.get("startggUrl") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/settings");
  revalidatePath(`/players/${userId}`);
  return { error: null };
}
