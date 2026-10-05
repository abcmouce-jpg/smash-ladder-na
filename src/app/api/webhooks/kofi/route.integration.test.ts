import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { POST } from "./route";

const TOKEN = "test-verification-token";

function kofiRequest(payload: Record<string, unknown>) {
  const body = new URLSearchParams({
    data: JSON.stringify({ verification_token: TOKEN, ...payload }),
  });
  return new Request("http://localhost/api/webhooks/kofi", { method: "POST", body });
}

beforeEach(() => {
  process.env.KOFI_VERIFICATION_TOKEN = TOKEN;
});

describe("POST /api/webhooks/kofi", () => {
  it("rejects a payload with the wrong verification token", async () => {
    const res = await POST(kofiRequest({ verification_token: "wrong", kofi_transaction_id: "t1", amount: "5.00" }));
    expect(res.status).toBe(401);
  });

  it("records a donation without a matching code, but doesn't grant perks", async () => {
    const res = await POST(
      kofiRequest({
        kofi_transaction_id: "t-no-code",
        from_name: "Anonymous Donor",
        message: "thanks for the site!",
        amount: "5.00",
        currency: "USD",
        is_public: true,
        type: "Tip",
      }),
    );
    expect(res.status).toBe(200);
    const donation = await prisma.kofiDonation.findUniqueOrThrow({ where: { kofiTransactionId: "t-no-code" } });
    expect(donation.matchedUserId).toBeNull();
  });

  it("grants supporter perks when the message contains a matching code and the amount clears the threshold", async () => {
    const user = await createTestUser({ supporterCode: "LADDER-ABC234" });
    const res = await POST(
      kofiRequest({
        kofi_transaction_id: "t-matched",
        from_name: "A Real Fan",
        message: "here's my code: ladder-abc234",
        amount: "5.00",
        currency: "USD",
        is_public: true,
        type: "Subscription",
      }),
    );
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isSupporter).toBe(true);
    expect(updated.supporterExpiresAt).not.toBeNull();
    expect(updated.supporterExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    const donation = await prisma.kofiDonation.findUniqueOrThrow({ where: { kofiTransactionId: "t-matched" } });
    expect(donation.matchedUserId).toBe(user.id);
  });

  it("does not grant perks when the amount is below the threshold, even with a matching code", async () => {
    const user = await createTestUser({ supporterCode: "LADDER-XYZ999" });
    await POST(
      kofiRequest({
        kofi_transaction_id: "t-too-small",
        from_name: "Small Tipper",
        message: "LADDER-XYZ999",
        amount: "1.00",
        currency: "USD",
        is_public: true,
        type: "Tip",
      }),
    );

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isSupporter).toBe(false);
  });

  it("grants Gold on top of base perks when the amount clears the Gold threshold", async () => {
    const user = await createTestUser({ supporterCode: "LADDER-GTEST2" });
    await POST(
      kofiRequest({
        kofi_transaction_id: "t-gold",
        from_name: "Big Spender",
        message: "LADDER-GTEST2",
        amount: "20.00",
        currency: "USD",
        is_public: true,
        type: "Tip",
      }),
    );

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isSupporter).toBe(true);
    expect(updated.isGoldSupporter).toBe(true);
  });

  it("does not grant Gold when the amount clears base but not the Gold threshold", async () => {
    const user = await createTestUser({ supporterCode: "LADDER-BTEST2" });
    await POST(
      kofiRequest({
        kofi_transaction_id: "t-base-only",
        from_name: "Regular Fan",
        message: "LADDER-BTEST2",
        amount: "5.00",
        currency: "USD",
        is_public: true,
        type: "Tip",
      }),
    );

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isSupporter).toBe(true);
    expect(updated.isGoldSupporter).toBe(false);
  });

  it("drops Gold on a renewal that no longer clears the Gold threshold", async () => {
    const user = await createTestUser({ supporterCode: "LADDER-DTEST2", isGoldSupporter: true });
    await POST(
      kofiRequest({
        kofi_transaction_id: "t-downgrade",
        from_name: "Big Spender",
        message: "LADDER-DTEST2",
        amount: "5.00",
        currency: "USD",
        is_public: true,
        type: "Subscription",
      }),
    );

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isSupporter).toBe(true);
    expect(updated.isGoldSupporter).toBe(false);
  });

  it("is idempotent on Ko-fi's documented at-least-once delivery retries", async () => {
    const user = await createTestUser({ supporterCode: "LADDER-RETRY9" });
    const request = () =>
      kofiRequest({
        kofi_transaction_id: "t-retry",
        from_name: "Retried Donor",
        message: "LADDER-RETRY9",
        amount: "10.00",
        currency: "USD",
        is_public: false,
        type: "Tip",
      });
    await POST(request());
    await POST(request());

    const donations = await prisma.kofiDonation.findMany({ where: { kofiTransactionId: "t-retry" } });
    expect(donations).toHaveLength(1);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isSupporter).toBe(true);
  });
});
