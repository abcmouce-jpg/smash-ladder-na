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

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
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
      update: {},
      create: { discordId, username },
    });
    return { id: user.id, name: user.username };
  },
});

const providers =
  process.env.NODE_ENV === "development" && !process.env.AUTH_DISCORD_ID
    ? [devCredentials]
    : [Discord];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    async signIn({ profile, credentials }) {
      if (credentials) return true; // dev credentials — user already created in authorize()

      const discordProfile = profile as DiscordProfile | undefined;
      if (!discordProfile?.id) return false;

      const existing = await prisma.user.findUnique({
        where: { discordId: discordProfile.id },
        select: { status: true },
      });
      if (existing?.status === UserStatus.BANNED) return false;

      await prisma.user.upsert({
        where: { discordId: discordProfile.id },
        // username is intentionally excluded here — players can rename
        // themselves on the site (their Discord name often doesn't match
        // their player tag), and re-syncing from Discord on every sign-in
        // would silently wipe that out.
        update: {
          avatarUrl: discordProfile.image_url,
        },
        create: {
          discordId: discordProfile.id,
          username: discordProfile.global_name ?? discordProfile.username,
          avatarUrl: discordProfile.image_url,
          email: discordProfile.email ?? undefined,
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
        // their existing session would silently keep admin access.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { role: true },
        });
        session.user.role = dbUser?.role ?? "USER";
      }
      return session;
    },
  },
});
