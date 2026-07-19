// AdSense requires this exact file at the domain root once an account is
// linked. Served dynamically from the same env var as the ad script/slots
// so there's one place to configure it, rather than a static public file
// that'd need editing at deploy time.
export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim();
  if (!clientId) {
    return new Response("", { headers: { "Content-Type": "text/plain" } });
  }

  const pubId = clientId.replace(/^ca-pub-/, "pub-");
  return new Response(`google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain" },
  });
}
