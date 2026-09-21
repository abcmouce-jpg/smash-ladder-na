// The absolute origin of whichever deployment is serving the request — for
// anything that has to name the site in a context it doesn't control: invite
// links handed to a new player, and post announcements mirrored into Discord.
//
// Deliberately not a constant baked into the source: the site has to name
// whichever origin actually serves it — production, a custom domain, or a
// preview deployment — and that differs per environment. SITE_URL is the
// explicit override; otherwise Vercel's own VERCEL_PROJECT_PRODUCTION_URL
// covers deployed environments with no extra configuration, and localhost
// stands in for dev. Resolved per call rather than cached at module load so a
// process (or a test) sees the environment it's actually running with.
export function siteOrigin(): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelDomain) return `https://${vercelDomain.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
