import { redirect } from "next/navigation";

// /free-battle was renamed to /board in the site-structure redesign. This
// keeps old bookmarks/Discord-announcement links working.
export default function FreeBattleRedirectPage() {
  redirect("/board");
}
