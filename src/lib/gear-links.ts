import { REGION_SET } from "@/lib/site";

// Amazon search-result links instead of fixed product pages — a specific
// ASIN can go out of stock or get delisted and turn into a dead/wrong link,
// while a search query for "nintendo switch ethernet adapter" stays
// correct indefinitely. The affiliate tag is optional: unset, these are
// just plain Amazon links with no commission.
// Which Amazon a reader can actually order from. amazon.com does not ship
// most of this to Japan, and an affiliate tag is per-marketplace, so the tag
// is only attached when it matches the storefront being linked.
const AMAZON_HOST = REGION_SET === "jp" ? "www.amazon.co.jp" : "www.amazon.com";

function amazonSearchUrl(query: string): string {
  const tag = process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG?.trim();
  const params = new URLSearchParams({ k: query });
  if (tag) params.set("tag", tag);
  return `https://${AMAZON_HOST}/s?${params.toString()}`;
}

// Search terms stay in English even on amazon.co.jp — the listings there are
// indexed under both, and an English query avoids guessing at the katakana a
// given seller used.
export const GEAR_RECOMMENDATIONS = [
  {
    label: {
      en: "USB-C to Ethernet adapter (for wired play undocked)",
      es: "Adaptador USB-C a Ethernet (para jugar con cable sin dock)",
      ja: "USB-C 有線LANアダプタ（携帯モードで有線にする場合）",
    },
    query: "nintendo switch usb c ethernet adapter",
  },
  {
    label: {
      en: "GameCube controller",
      es: "Control de GameCube",
      ja: "ゲームキューブコントローラー",
    },
    query: "nintendo switch gamecube controller",
  },
  {
    label: {
      en: "GameCube controller adapter",
      es: "Adaptador de control de GameCube",
      ja: "ゲームキューブコントローラー接続タップ",
    },
    query: "mayflash gamecube controller adapter switch",
  },
].map((item) => ({ ...item, url: amazonSearchUrl(item.query) }));
