// Amazon search-result links instead of fixed product pages — a specific
// ASIN can go out of stock or get delisted and turn into a dead/wrong link,
// while a search query for "nintendo switch ethernet adapter" stays
// correct indefinitely. The affiliate tag is optional: unset, these are
// just plain Amazon links with no commission.
function amazonSearchUrl(query: string): string {
  const tag = process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG?.trim();
  const params = new URLSearchParams({ k: query });
  if (tag) params.set("tag", tag);
  return `https://www.amazon.com/s?${params.toString()}`;
}

export const GEAR_RECOMMENDATIONS = [
  { label: "USB-C to Ethernet adapter (for wired play undocked)", query: "nintendo switch usb c ethernet adapter" },
  { label: "GameCube controller", query: "nintendo switch gamecube controller" },
  { label: "GameCube controller adapter", query: "mayflash gamecube controller adapter switch" },
].map((item) => ({ ...item, url: amazonSearchUrl(item.query) }));
