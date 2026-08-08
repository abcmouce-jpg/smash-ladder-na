import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// POST /api/push/subscribe — the service worker's pushsubscriptionchange
// handler posts a rotated subscription here (the fetch carries the session
// cookie, so this identifies the account the same way a server action does).
// The settings toggle's normal subscribe path goes through the
// savePushSubscriptionAction server action instead.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const authSecret = body?.keys?.auth;
  if (!endpoint || !p256dh || !authSecret) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh, auth: authSecret },
    update: { userId: session.user.id, p256dh, auth: authSecret },
  });
  return NextResponse.json({ ok: true });
}
