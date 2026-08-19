import { NextResponse } from "next/server";

// GET /api/push/vapid-public-key — the service worker needs the VAPID public
// key to re-subscribe when the push service rotates a subscription, but as a
// static file in public/ it has no access to env vars. The key is public by
// design, so serving it is safe.
export async function GET() {
  return NextResponse.json({ key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null });
}
