import Link from "next/link";
import { MapPin } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// 9 of the first 13 real sign-ups never set a region — meaning they
// couldn't queue for a ranked match at all, silently, with no indication
// anywhere outside the Lobby page itself. Shown site-wide so it's seen
// regardless of which page someone lands on after signing in.
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
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-2 text-sm">
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
