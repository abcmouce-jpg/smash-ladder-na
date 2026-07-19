const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim() || null;

// Renders nothing until an AdSense publisher ID is configured — same
// no-op-until-configured pattern as the Discord bot token, so the ad slot
// is safe to place everywhere ahead of AdSense account approval.
export function AdSlot({ slot }: { slot: string | undefined }) {
  const trimmedSlot = slot?.trim();
  if (!ADSENSE_CLIENT_ID || !trimmedSlot) return null;

  return (
    <div className="my-6 flex justify-center overflow-hidden">
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={trimmedSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: "(adsbygoogle = window.adsbygoogle || []).push({});",
        }}
      />
    </div>
  );
}

export { ADSENSE_CLIENT_ID };
