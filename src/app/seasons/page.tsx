import { redirect } from "next/navigation";

// /seasons moved into the combined Stats page during the site-structure
// redesign. Season archives themselves stay at /seasons/[id]. Keep old
// bookmarks/links working.
export default function SeasonsRedirectPage() {
  redirect("/stats?tab=seasons");
}
