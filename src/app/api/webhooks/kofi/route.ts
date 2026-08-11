import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    },
    update: {},
  });

  return NextResponse.json({ ok: true });
}
