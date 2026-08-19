import { headers, cookies } from "next/headers";
import NextAuth from "next-auth";
import type { DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";
import type { DiscordProfile } from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required for the module augmentation below to resolve
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import type { UserRole } from "@/generated/prisma/enums";
import { extractClientIp, isIpBanned } from "@/lib/ip-bans";
import { resolveReferrerId } from "@/lib/referrals";
import { defaultRegionFromGeoHeaders } from "@/lib/geo-region";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      isSupporter: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
  }
}

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

export const { handlers, auth, signIn, signOut } = NextAuth({
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

      const existing = await prisma.user.findUnique({
        where: { discordId: discordProfile.id },
        select: { status: true },
      });
      if (existing?.status === UserStatus.BANNED) return false;

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

      const discordUsername = discordProfile.global_name ?? discordProfile.username;
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
          avatarUrl: discordProfile.image_url,
          lastKnownIp: ip ?? undefined,
          lastSignInAt: new Date(),
        },
        create: {
          discordId: discordProfile.id,
          username: discordUsername,
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
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          return token;
        }
      }
      const discordProfile = profile as DiscordProfile | undefined;
      if (discordProfile?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { discordId: discordProfile.id },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
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
          select: { role: true, username: true, isSupporter: true },
        });
        session.user.role = dbUser?.role ?? "USER";
        session.user.isSupporter = dbUser?.isSupporter ?? false;
        if (dbUser?.username) session.user.name = dbUser.username;
      }
      return session;
    },
  },
});
