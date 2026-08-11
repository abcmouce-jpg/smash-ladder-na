import Link from "next/link";
import { MapPin } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// 9 of the first 13 real sign-ups never set a region — meaning they
// couldn't queue for a ranked match at all, silently, with no indication
// anywhere outside the Lobby page itself. New sign-ups now get a region
// pre-filled from Vercel's geolocation headers at account creation (see
// auth.ts's defaultRegionFromGeoHeaders), so this should now only catch:
// geolocation misses (VPNs, unmapped countries), pre-existing accounts from
// before that shipped, and dev-credentials logins (no real IP). Kept
// site-wide so it's still seen regardless of which page someone lands on.
export async function RegionSetupBanner() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { region: true },
  });
  if (!user || user.region) return null;

  return (
    <div className="border-b border-border bg-primary/5">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-2 text-sm">
        <MapPin className="size-3.5 text-primary" />
        <span className="text-muted-foreground">
          Set your region to start matching —
        </span>
        <Link href="/lobby" className="font-medium text-primary hover:underline">
          go to Lobby
        </Link>
      </div>
    </div>
  );
}
