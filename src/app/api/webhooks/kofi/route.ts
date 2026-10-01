import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { KOFI_SUPPORTER_GRACE_DAYS } from "@/lib/supporters";

// $3 minimum for a payment to grant perks — a $1 tip shouldn't buy a month
// of ad-free, but shouldn't be rejected either; it's still a real donation,
// just one that only shows up on the public /supporters wall.
const MIN_SUPPORTER_AMOUNT_USD = 3;

// Matches a code pasted anywhere in the Ko-fi message, case-insensitively —
// donors won't reliably match the ALL-CAPS casing shown in Settings, and
// some will add their own text around it ("thanks! LADDER-AB23XY").
const SUPPORTER_CODE_PATTERN = /LADDER-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}/i;

// Ko-fi POSTs application/x-www-form-urlencoded with a single "data" field
// holding a JSON string — not a JSON body directly. Docs:
// https://help.ko-fi.com/hc/en-us/articles/360004162298-Webhooks
interface KofiPayload {
  verification_token: string;
  kofi_transaction_id: string;
  from_name: string;
  message: string | null;
  amount: string;
  currency: string;
  is_public: boolean;
  type: "Tip" | "Subscription" | "Commission" | "Shop Order";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const raw = form.get("data");
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "Missing data field" }, { status: 400 });
  }

  let payload: KofiPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const secret = process.env.KOFI_VERIFICATION_TOKEN;
  if (!secret || payload.verification_token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A supporterCode pasted into the message links this payment back to an
  // account. No match (wrong/missing code, or a code that's since been
  // reassigned — it never is, but belt and suspenders) just means this
  // donation only shows up on the public wall, same as before this existed.
  const codeMatch = payload.message?.match(SUPPORTER_CODE_PATTERN);
  const meetsThreshold = Number.parseFloat(payload.amount) >= MIN_SUPPORTER_AMOUNT_USD;
  const matchedUser =
    codeMatch && meetsThreshold
      ? await prisma.user.findUnique({
          where: { supporterCode: codeMatch[0].toUpperCase() },
          select: { id: true },
        })
      : null;

  // Ko-fi retries delivery on anything but a 200, so this needs to be
  // idempotent — upsert on their transaction id rather than blind-create.
  await prisma.kofiDonation.upsert({
    where: { kofiTransactionId: payload.kofi_transaction_id },
    create: {
      kofiTransactionId: payload.kofi_transaction_id,
      fromName: payload.from_name || "Anonymous",
      message: payload.message || null,
      amount: payload.amount,
      currency: payload.currency,
      isPublic: payload.is_public,
      isSubscription: payload.type === "Subscription",
      matchedUserId: matchedUser?.id,
    },
    update: {},
  });

  if (matchedUser) {
    await prisma.user.update({
      where: { id: matchedUser.id },
      data: {
        isSupporter: true,
        supporterExpiresAt: new Date(Date.now() + KOFI_SUPPORTER_GRACE_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
