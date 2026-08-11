import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RegionSetupBanner } from "@/components/region-setup-banner";
import { PreSeasonBanner } from "@/components/pre-season-banner";
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
  const showAds = !isStreamOverlay && !session?.user?.isSupporter;

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
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
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
        {!isStreamOverlay && <RegionSetupBanner />}
        {children}
        {!isStreamOverlay && <SiteFooter />}
        {!isStreamOverlay && <Analytics />}
        {!isStreamOverlay && <Toaster />}
      </body>
    </html>
  );
}
