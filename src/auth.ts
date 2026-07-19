import NextAuth from "next-auth";
import type { DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";
import type { DiscordProfile } from "next-auth/providers/discord";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Discord],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    async signIn({ profile }) {
      const discordProfile = profile as DiscordProfile | undefined;
      if (!discordProfile?.id) return false;

      const existing = await prisma.user.findUnique({
        where: { discordId: discordProfile.id },
        select: { status: true },
      });
      if (existing?.status === UserStatus.BANNED) return false;

      await prisma.user.upsert({
        where: { discordId: discordProfile.id },
        update: {
          username: discordProfile.global_name ?? discordProfile.username,
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
    async jwt({ token, profile }) {
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
      if (token.userId) session.user.id = token.userId;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
