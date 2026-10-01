import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RegionSetupBanner } from "@/components/region-setup-banner";
import { QueueStatusBanner } from "@/components/queue-status-banner";
import { PreSeasonBanner } from "@/components/pre-season-banner";
import { SeasonEndingBanner } from "@/components/season-ending-banner";
import { DiscordJoinGate } from "@/components/discord-join-gate";
import { ThemeSync } from "@/components/theme-sync";
import { ADSENSE_CLIENT_ID } from "@/components/ad-slot";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://smash-ladder-na.vercel.app";
const TITLE = "Smash Ladder NA";
const DESCRIPTION = "North American ranked ladder and matchmaking for Smash.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: "/smash_ladder_icon.png",
    apple: "/smash_ladder_icon.png",
  },
  // No og:image here — the opengraph-image.tsx file convention (sibling to
  // this layout) generates and injects it automatically, and duplicating a
  // static one here would just fight it.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: TITLE,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // /stream/* pages are captured directly by OBS as a broadcast overlay —
  // none of the normal site chrome (nav, banners, ads, footer) belongs in
  // that frame, and a transparent background lets them composite over
  // whatever's underneath instead of blocking it with a solid box.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isStreamOverlay = pathname.startsWith("/stream");
  // Supporters (see User.isSupporter) don't just get the ad slots hidden —
  // the adsbygoogle.js script itself is skipped so no ad request/tracking
  // ever fires for them at all.
  const session = await auth();
  // These are sign-in walls or empty shells for a signed-out visitor (and,
  // for Tournaments specifically, functionally empty for everyone — see the
  // #development note on it having had one event ever). AdSense flagged the
  // account for insufficient content, and loading the ad script here — Auto
  // ads doesn't need an explicit <ins> slot to place one — put real ad
  // requests next to a "sign in to see this" page or a near-empty one. None
  // of these four carry an AdSlot anyway.
  const AD_SCRIPT_DISABLED_PATHS = ["/lobby", "/settings", "/tournaments", "/notes", "/friendlies"];
  const isAdThinPage = AD_SCRIPT_DISABLED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const showAds = !isStreamOverlay && !isAdThinPage && !session?.user?.isSupporter;
  // A session predating the Discord-membership requirement (or someone who's
  // since left the server) gets the exact same block as a brand-new sign-in
  // attempt would via auth.ts's signIn callback — just render it in place of
  // the page instead of redirecting, since they're already signed in and
  // redirect loops aren't worth the trouble. /join-discord itself is exempt
  // so its own "try again" action has somewhere to land.
  const blockedForDiscord =
    !isStreamOverlay && pathname !== "/join-discord" && Boolean(session?.user?.needsDiscordJoin);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className={`min-h-full flex flex-col text-foreground ${isStreamOverlay ? "bg-transparent" : "bg-background"}`}
      >
        {/* Plain script tags, not next/script — layout.tsx is a Server
            Component, so these only ever exist in the static SSR'd HTML and
            run before hydration. next/script's beforeInteractive strategy
            re-renders this same element as part of a Client Component on
            the client, which trips React 19's "script tag rendered on the
            client" warning without actually changing what ships. This also
            matters for the AdSense script specifically: next/script's
            default afterInteractive strategy only emits a <link rel=preload>
            in the server-rendered HTML and injects the real <script> tag
            client-side — Google's AdSense site-verification crawler doesn't
            run that JS, so it never saw the actual tag it was looking for. */}
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||'auto';if(t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <ThemeSync />
        {showAds && ADSENSE_CLIENT_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
            suppressHydrationWarning
          />
        )}
        {!isStreamOverlay && <SiteHeader />}
        {!isStreamOverlay && <PreSeasonBanner />}
        {!isStreamOverlay && <SeasonEndingBanner />}
        {!isStreamOverlay && <RegionSetupBanner />}
        {!isStreamOverlay && <QueueStatusBanner />}
        {blockedForDiscord ? <DiscordJoinGate /> : children}
        {!isStreamOverlay && <SiteFooter />}
        {!isStreamOverlay && <Analytics />}
        {!isStreamOverlay && <Toaster />}
      </body>
    </html>
  );
}
