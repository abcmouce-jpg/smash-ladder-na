import { cache } from "react";
import { headers, cookies } from "next/headers";
import NextAuth from "next-auth";
import type { DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";
import type { DiscordProfile } from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required for the module augmentation below to resolve
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { DELETED_USERNAME } from "@/lib/account";
import { UserStatus } from "@/generated/prisma/enums";
import type { UserRole } from "@/generated/prisma/enums";
import { extractClientIp, isIpBanned } from "@/lib/ip-bans";
import { resolveReferrerId } from "@/lib/referrals";
import { defaultRegionFromGeoHeaders } from "@/lib/geo-region";
import { checkGuildMembership } from "@/lib/discord-bot";
import { isEffectiveSupporter } from "@/lib/supporters";
import { COMMUNITY_GUILD_ID } from "@/lib/links";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      isSupporter: boolean;
      needsDiscordJoin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
    // Epoch ms of the last guild-membership check attempt, success or not —
    // re-checked at most every MEMBER_RECHECK_MS once confirmed a member, or
    // NONMEMBER_RECHECK_MS while still locked out (see the jwt callback).
    // The lookup endpoint's own rate limit is a strict 5/sec: an earlier cut
    // of this re-checked a non-member on literally every request (to unblock
    // them the instant they joined), which under real concurrent traffic
    // exhausted that 5/sec budget and made signIn() itself flaky for
    // everyone (surfaced as /api/auth/error, 2026-09-30 incident).
    discordLastCheckedAt?: number;
    needsDiscordJoin?: boolean;
  }
}

// How often an already-verified member gets re-checked. Short enough that
// someone who leaves the server loses site access the same day, long
// enough that normal browsing doesn't come anywhere near the lookup
// endpoint's 5/sec bucket.
const MEMBER_RECHECK_MS = 6 * 60 * 60 * 1000;

// How often a currently-locked-out (or never-checked) session gets
// re-checked. Short enough to feel instant once someone actually joins,
// long enough that a page poller or a burst of concurrently-blocked users
// doesn't light up the 5/sec bucket the way "every request" did.
const NONMEMBER_RECHECK_MS = 60 * 1000;

// Kill switch for the Discord-membership gate below — this was meant to stay
// off in production until staff announce it in Discord (see the commit that
// introduced it), but shipped without one and immediately locked out the
// 39% of engaged accounts not in the server. Unset/"false" = gate disabled
// (fails open, nobody is blocked). Set ENFORCE_DISCORD_MEMBERSHIP=true once
// staff have actually announced it.
const ENFORCE_DISCORD_MEMBERSHIP = process.env.ENFORCE_DISCORD_MEMBERSHIP === "true";

const devCredentials = Credentials({
  credentials: { username: { label: "Username" } },
  async authorize(credentials) {
    const username = (credentials.username as string)?.trim() || "Dev Player";
    const discordId = `dev-${username.toLowerCase().replace(/\s+/g, "-")}`;
    const user = await prisma.user.upsert({
      where: { discordId },
      update: { lastSignInAt: new Date() },
      create: { discordId, username, lastSignInAt: new Date() },
    });
    return { id: user.id, name: user.username };
  },
});

const useDevCredentials = process.env.NODE_ENV === "development" && !process.env.AUTH_DISCORD_ID;
const providers = useDevCredentials ? [devCredentials] : [Discord];

// Only one provider is ever registered above, but `signIn()` with no provider
// id renders Auth.js's generic (unstyled) provider-picker page instead of
// going straight to it — callers should pass this explicitly.
export const primaryProviderId = useDevCredentials ? "credentials" : "discord";

const { handlers, auth: uncachedAuth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    async signIn({ profile, credentials }) {
      // Checked before anything else, including the dev-credentials bypass —
      // this targets the network (ban-evasion via a fresh Discord account
      // from the same connection), not a specific account.
      const requestHeaders = await headers();
      const ip = extractClientIp(requestHeaders.get("x-forwarded-for"));
      if (await isIpBanned(ip)) return false;

      if (credentials) return true; // dev credentials — user already created in authorize()

      const discordProfile = profile as DiscordProfile | undefined;
      if (!discordProfile?.id) return false;

      // Membership in our own Discord server is required to use the site at
      // all — staff otherwise have no way to reach someone who runs into a
      // dispute or a bug and never joined. Fails OPEN on a check that
      // couldn't be completed (Discord API hiccup, rate limit exhausted):
      // this gate exists to require joining, not to take the site down
      // every time Discord has a bad minute. A confirmed non-member is
      // bounced to a page explaining why, with the invite link.
      if (ENFORCE_DISCORD_MEMBERSHIP) {
        const isMember = await checkGuildMembership(COMMUNITY_GUILD_ID, discordProfile.id);
        if (isMember === false) return "/join-discord";
      }

      const existing = await prisma.user.findUnique({
        where: { discordId: discordProfile.id },
        select: { status: true, username: true },
      });
      if (existing?.status === UserStatus.BANNED) return false;
      // A deleted account resumes this same row on sign-in (see
      // deleteMyAccount) rather than forking a new one — but re-syncing
      // avatarUrl from Discord below would silently undo the "avatar gone"
      // half of that anonymization the moment they next signed in. Stays
      // null until they take some other action that un-deletes them (e.g.
      // renaming away from "Deleted User").
      const isAnonymized = existing?.username === DELETED_USERNAME;

      // Only resolved for a genuinely new account (existing is null) —
      // referredById is set once, at creation, and never touched again, so
      // there's no point looking this up for a returning sign-in.
      const referredById = existing ? null : await resolveReferrerId((await cookies()).get("ref")?.value);

      // Same "only for a genuinely new account" reasoning as referredById —
      // pre-fills region from Vercel's geolocation headers so a new player
      // can join the queue immediately instead of silently being stuck
      // until they find Lobby's settings (see region-setup-banner.tsx for
      // why this matters: most early sign-ups never came back to set it).
      // Never touches an existing account's region.
      const defaultRegion = existing
        ? null
        : defaultRegionFromGeoHeaders(
            requestHeaders.get("x-vercel-ip-country"),
            requestHeaders.get("x-vercel-ip-country-region"),
          );

      // global_name is Discord's user-chosen display name, while username is
      // the actual handle (e.g. "foxmain_east"). The profile shows the handle,
      // so that's what discordUsername tracks; the display name is only used
      // as the default site username for a brand-new account.
      const discordUsername = discordProfile.username;
      const discordDisplayName = discordProfile.global_name ?? discordUsername;
      await prisma.user.upsert({
        where: { discordId: discordProfile.id },
        // username is intentionally excluded here — players can rename
        // themselves on the site (their Discord name often doesn't match
        // their player tag), and re-syncing from Discord on every sign-in
        // would silently wipe that out. discordUsername is the opposite:
        // always kept current, so a renamed player's actual Discord
        // identity stays visible on their profile even after they've
        // changed their site username.
        update: {
          discordUsername,
          ...(isAnonymized ? {} : { avatarUrl: discordProfile.image_url }),
          lastKnownIp: ip ?? undefined,
          lastSignInAt: new Date(),
        },
        create: {
          discordId: discordProfile.id,
          username: discordDisplayName,
          discordUsername,
          avatarUrl: discordProfile.image_url,
          email: discordProfile.email ?? undefined,
          lastKnownIp: ip ?? undefined,
          lastSignInAt: new Date(),
          referredById,
          region: defaultRegion ?? undefined,
        },
      });

      return true;
    },
    async jwt({ token, user, profile }) {
      // `profile` is only ever populated on a genuine OAuth exchange (never
      // for the Credentials provider), so it — not `user?.id` — is what
      // actually distinguishes the two cases. The Discord provider's own
      // profile() maps `user.id` to profile.id, i.e. Discord's snowflake,
      // not our internal cuid — the old `if (user?.id)` branch looked that
      // snowflake up against our own id column, which can never match,
      // silently leaving token.userId (and so session.user.id) unset on
      // every fresh Discord sign-in. Checking profile first instead means
      // dev credentials (no profile, user.id = our own id from authorize())
      // and real sign-ins (profile.id = discordId) each resolve correctly
      // regardless of whether `user` also happens to be present.
      const discordProfile = profile as DiscordProfile | undefined;
      if (discordProfile?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { discordId: discordProfile.id },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      } else if (user?.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      }

      // Only this callback's return value is re-signed into the stored
      // token, so the cached check lives here, not in the session callback
      // below (mutating `token` there never persists). Runs on every
      // authenticated request, hence the interval gate.
      if (!ENFORCE_DISCORD_MEMBERSHIP) {
        // Clears a `needsDiscordJoin: true` already baked into an existing
        // session's token from while the gate was live, so anyone it
        // already locked out unblocks on their very next request instead
        // of staying stuck until the token naturally expires.
        token.needsDiscordJoin = false;
      } else if (
        token.userId &&
        Date.now() - (token.discordLastCheckedAt ?? 0) >
          (token.needsDiscordJoin ? NONMEMBER_RECHECK_MS : MEMBER_RECHECK_MS)
      ) {
        const account = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { discordId: true },
        });
        // Dev-credentials accounts (discordId starting "dev-") have no real
        // Discord identity to check against.
        if (account && !account.discordId.startsWith("dev-")) {
          token.discordLastCheckedAt = Date.now();
          const isMember = await checkGuildMembership(COMMUNITY_GUILD_ID, account.discordId);
          if (isMember === true) {
            token.needsDiscordJoin = false;
          } else if (isMember === false) {
            token.needsDiscordJoin = true;
          }
          // null (couldn't verify) — leave needsDiscordJoin as it was, same
          // fail-open reasoning as the sign-in gate. discordLastCheckedAt is
          // still bumped above so a string of API hiccups doesn't retry
          // every single request either.
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        // Re-read fresh from the DB on every session check rather than
        // trusting the JWT's role claim, which is only ever populated at
        // sign-in time (the `profile` param the jwt callback keys off is
        // absent on subsequent calls). Otherwise, revoking a MOD/ADMIN's
        // role wouldn't take effect until they happened to sign out —
        // their existing session would silently keep admin access. Same
        // reasoning for username: session.user.name otherwise stays
        // whatever it was at sign-in forever, so renaming yourself on the
        // site wouldn't be reflected anywhere reading the session (e.g. the
        // header) until a fresh sign-in. Same for isSupporter: an admin
        // toggling it off should hide ads again immediately, not on next login.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { role: true, username: true, isSupporter: true, supporterExpiresAt: true },
        });
        session.user.role = dbUser?.role ?? "USER";
        session.user.isSupporter = dbUser ? isEffectiveSupporter(dbUser) : false;
        session.user.needsDiscordJoin = Boolean(token.needsDiscordJoin);
        if (dbUser?.username) session.user.name = dbUser.username;
      }
      return session;
    },
  },
});

// Memoized per-request: layout.tsx, site-header.tsx, and a given page can
// each independently call auth() while rendering the same request, and
// without this every one of those re-runs the full jwt() callback —
// including, while ENFORCE_DISCORD_MEMBERSHIP is on, its own guild-member
// lookup. Four auth() calls in one /lobby render (confirmed in production
// logs) meant four lookups per page load, which is most of why that
// endpoint's 5/sec bucket blew out under real traffic even after capping
// the per-session recheck interval. React's cache() scopes the memoization
// to a single request, so this never serves a stale session across requests.
export const auth = cache(uncachedAuth);
export { handlers, signIn, signOut };
