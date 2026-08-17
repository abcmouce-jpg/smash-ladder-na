import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { actionReport, fileConnectionReport, moderateUserDirectly } from "@/lib/reports";
import { ReportStatus, UserStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, status: "PENDING_REPORT", expiresAt: new Date() },
  });
}

describe("fileConnectionReport", () => {
  it("records a report against the opponent", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const match = await createMatch(a.id, b.id);

    await fileConnectionReport(a.id, match.id);

    const reports = await prisma.connectionReport.findMany({ where: { matchId: match.id } });
    expect(reports).toHaveLength(1);
    expect(reports[0].reporterId).toBe(a.id);
    expect(reports[0].reportedUserId).toBe(b.id);
  });

  it("is a no-op on a repeat report for the same match", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const match = await createMatch(a.id, b.id);

    await fileConnectionReport(a.id, match.id);
    await fileConnectionReport(a.id, match.id);

    const reports = await prisma.connectionReport.findMany({ where: { matchId: match.id } });
    expect(reports).toHaveLength(1);
  });

  it("rejects a non-participant", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const outsider = await createTestUser();
    const match = await createMatch(a.id, b.id);

    await expect(fileConnectionReport(outsider.id, match.id)).rejects.toThrow(/not a participant/i);
  });

  it("auto-clears wiredConnection once enough opponents dispute it", async () => {
    // 2 prior reports + 0 games played already sits right at the "not yet
    // disputed" boundary (2 < WIRED_TRUST_MIN_CONNECTION_REPORTS) — this
    // third one is what tips it over.
    const reported = await createTestUser({ wiredConnection: true, gamesPlayed: 0 });
    const priorMatch1 = await createMatch(reported.id, (await createTestUser()).id);
    const priorMatch2 = await createMatch(reported.id, (await createTestUser()).id);
    await prisma.connectionReport.createMany({
      data: [
        { matchId: priorMatch1.id, reporterId: priorMatch1.player2Id, reportedUserId: reported.id },
        { matchId: priorMatch2.id, reporterId: priorMatch2.player2Id, reportedUserId: reported.id },
      ],
    });
    const reporter = await createTestUser();
    const match = await createMatch(reporter.id, reported.id);

    await fileConnectionReport(reporter.id, match.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: reported.id } });
    expect(updated.wiredConnection).toBe(false);
  });

  it("doesn't touch wiredConnection while still under the dispute threshold", async () => {
    const reported = await createTestUser({ wiredConnection: true, gamesPlayed: 100 });
    const reporter = await createTestUser();
    const match = await createMatch(reporter.id, reported.id);

    await fileConnectionReport(reporter.id, match.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: reported.id } });
    expect(updated.wiredConnection).toBe(true);
  });
});

describe("moderateUserDirectly", () => {
  it("insta-suspends with a timed expiry, bypassing report thresholds", async () => {
    const mod = await createTestUser();
    const target = await createTestUser();

    await moderateUserDirectly(mod.id, target.id, "SUSPEND", { suspensionHours: 24, reason: "test" });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.SUSPENDED);
    expect(updated.suspendedUntil).not.toBeNull();
    expect(updated.suspendedUntil!.getTime()).toBeGreaterThan(Date.now());

    const auditReport = await prisma.conductReport.findFirst({
      where: { reporterId: mod.id, reportedUserId: target.id },
    });
    expect(auditReport?.status).toBe("ACTIONED");
    expect(auditReport?.reason).toBe("test");
    expect(auditReport?.actionTaken).toBe("SUSPENDED");
    expect(auditReport?.actionedById).toBe(mod.id);
    expect(auditReport?.actionSuspensionHours).toBe(24);
  });

  it("insta-suspends indefinitely when no duration is given", async () => {
    const mod = await createTestUser();
    const target = await createTestUser();

    await moderateUserDirectly(mod.id, target.id, "SUSPEND", { suspensionHours: null });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.SUSPENDED);
    expect(updated.suspendedUntil).toBeNull();
  });

  it("insta-bans regardless of report count", async () => {
    const mod = await createTestUser();
    const target = await createTestUser();

    await moderateUserDirectly(mod.id, target.id, "BAN");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.BANNED);
  });

  it("reinstates a suspended or banned user back to ACTIVE", async () => {
    const mod = await createTestUser();
    const target = await createTestUser({ status: UserStatus.BANNED });

    await moderateUserDirectly(mod.id, target.id, "REINSTATE");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.ACTIVE);
    expect(updated.suspendedUntil).toBeNull();
  });

  it("rejects downgrading an already-banned user to suspended", async () => {
    const mod = await createTestUser();
    const target = await createTestUser({ status: UserStatus.BANNED });

    await expect(moderateUserDirectly(mod.id, target.id, "SUSPEND")).rejects.toThrow(/already banned/i);
  });

  // The actual bug report this fixes: a mod re-suspending a repeat offender
  // who's already suspended got wrongly refused with "already suspended"
  // instead of applying the new duration — same-level re-application should
  // be a legitimate refresh, not a blocked downgrade.
  it("lets a mod re-suspend (extend) a user who's already suspended", async () => {
    const mod = await createTestUser();
    const target = await createTestUser({
      status: UserStatus.SUSPENDED,
      suspendedUntil: new Date(Date.now() + 60 * 60 * 1000),
    });

    await moderateUserDirectly(mod.id, target.id, "SUSPEND", { suspensionHours: 720 });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.SUSPENDED);
    expect(updated.suspendedUntil!.getTime()).toBeGreaterThan(Date.now() + 700 * 60 * 60 * 1000);
  });

  // Real incident: a suspension that had already expired (suspendedUntil in
  // the past) never gets lazily lifted back to ACTIVE unless the suspended
  // player themselves hits requireActiveUser — so a mod trying to suspend
  // them again for a new violation saw it refused as "already suspended"
  // even though the old suspension was long over.
  it("treats an already-expired suspension as liftable before re-suspending", async () => {
    const mod = await createTestUser();
    const target = await createTestUser({
      status: UserStatus.SUSPENDED,
      suspendedUntil: new Date(Date.now() - 60 * 60 * 1000),
    });

    await moderateUserDirectly(mod.id, target.id, "SUSPEND", { suspensionHours: 24 });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.SUSPENDED);
    expect(updated.suspendedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("actionReport", () => {
  async function createOpenReport(reporterId: string, reportedUserId: string) {
    return prisma.conductReport.create({
      data: { reporterId, reportedUserId, reason: "test", status: ReportStatus.OPEN },
    });
  }

  it("suspends a reported user and closes out their open reports", async () => {
    const mod = await createTestUser();
    const reporter = await createTestUser();
    const target = await createTestUser();
    const report = await createOpenReport(reporter.id, target.id);

    await actionReport(report.id, mod.id, "SUSPENDED", { suspensionHours: 24, skipThreshold: true });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.SUSPENDED);

    const updatedReport = await prisma.conductReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(updatedReport.status).toBe(ReportStatus.ACTIONED);
  });

  it("records the disposition (action, mod, duration) on every report it closes out", async () => {
    const mod = await createTestUser();
    const reporter = await createTestUser();
    const target = await createTestUser();
    const report1 = await createOpenReport(reporter.id, target.id);
    const report2 = await createOpenReport(reporter.id, target.id);

    await actionReport(report1.id, mod.id, "SUSPENDED", { suspensionHours: 48, skipThreshold: true });

    const [updated1, updated2] = await Promise.all([
      prisma.conductReport.findUniqueOrThrow({ where: { id: report1.id } }),
      prisma.conductReport.findUniqueOrThrow({ where: { id: report2.id } }),
    ]);
    for (const r of [updated1, updated2]) {
      expect(r.actionTaken).toBe("SUSPENDED");
      expect(r.actionedById).toBe(mod.id);
      expect(r.actionSuspensionHours).toBe(48);
      expect(r.actionedAt).not.toBeNull();
    }
  });

  // Same bug as moderateUserDirectly above, but via the report-queue path:
  // actioning a report against an already-suspended user used to silently
  // skip the user update entirely (no error, no effect) instead of applying
  // the new duration — a mod would see the report resolve with nothing
  // actually changing about the suspension.
  it("still applies a new suspension duration when the user is already suspended", async () => {
    const mod = await createTestUser();
    const reporter = await createTestUser();
    const target = await createTestUser({
      status: UserStatus.SUSPENDED,
      suspendedUntil: new Date(Date.now() + 60 * 60 * 1000),
    });
    const report = await createOpenReport(reporter.id, target.id);

    await actionReport(report.id, mod.id, "SUSPENDED", { suspensionHours: 720, skipThreshold: true });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.suspendedUntil!.getTime()).toBeGreaterThan(Date.now() + 700 * 60 * 60 * 1000);
  });

  it("doesn't downgrade an already-banned user back to suspended", async () => {
    const mod = await createTestUser();
    const reporter = await createTestUser();
    const target = await createTestUser({ status: UserStatus.BANNED });
    const report = await createOpenReport(reporter.id, target.id);

    await actionReport(report.id, mod.id, "SUSPENDED", { suspensionHours: 24, skipThreshold: true });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe(UserStatus.BANNED);
  });
});
