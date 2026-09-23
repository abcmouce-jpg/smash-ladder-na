import { redirect } from "next/navigation";

// /free-battle was renamed to /board in the site-structure redesign, and the
// Board was later renamed to /friendlies. This keeps old bookmarks and
// Discord-announcement links working.
export default function FreeBattleRedirectPage() {
  redirect("/friendlies");
}
