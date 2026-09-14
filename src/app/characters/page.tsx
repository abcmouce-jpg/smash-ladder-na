import { redirect } from "next/navigation";

// /characters moved into the combined Stats page during the site-structure
// redesign. Keep old bookmarks/links working.
export default function CharactersRedirectPage() {
  redirect("/stats?tab=characters");
}
