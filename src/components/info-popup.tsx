import Link from "next/link";
import { Info } from "lucide-react";
import { RankTierList } from "@/components/rank-tier-list";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// The Info nav tab plus the popup it opens. Holds no open/close state of its
// own — Radix's Dialog tracks that internally and DialogClose closes it — so
// this stays a Server Component and ships no client JS beyond the primitive
// itself, the same way SiteHeader already renders DropdownMenu directly.
//
// The trigger's classes are the four sibling nav tabs' classes verbatim plus
// cursor-pointer. Tailwind's preflight already makes a <button> inherit the
// nav's font size and color, but the browser still gives it an arrow cursor
// where an <a href> gets a pointer, which is the one visible difference.
export function InfoPopup() {
  return (
    <Dialog>
      <DialogTrigger className="flex items-center gap-1.5 hover:text-foreground cursor-pointer">
        <Info className="size-3.5" />
        Info
      </DialogTrigger>
      <DialogContent>
        <div className="flex items-center gap-2">
          <Info className="size-5 text-muted-foreground" />
          <DialogTitle>Info</DialogTitle>
        </div>
        <DialogDescription className="mt-1">
          Every rank a player can hold, highest first. Your rank comes from your ladder rating,
          which starts at 1500 and moves after every confirmed ranked set.
        </DialogDescription>

        <RankTierList className="mt-8" />

        {/* DialogClose asChild, not an onClick handler: SiteHeader survives a
            client-side route change, so without closing here the popup would
            still be sitting open over whichever page the link went to. asChild
            keeps the real Link underneath, so navigation is unaffected — and
            it means this component still needs no state of its own. */}
        <p className="mt-6 text-sm text-muted-foreground">
          See also{" "}
          <DialogClose asChild>
            <Link href="/rules" prefetch={false} className="underline hover:text-foreground">
              Rules
            </Link>
          </DialogClose>{" "}
          and{" "}
          <DialogClose asChild>
            <Link href="/faq" prefetch={false} className="underline hover:text-foreground">
              Q&amp;A
            </Link>
          </DialogClose>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
