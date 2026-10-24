import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

// PWA manifest — without this, browsers (and iOS in particular) won't offer
// "Add to Home Screen", which is the only way iOS delivers push
// notifications. Pure metadata: no caching/offline behavior is registered.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/smash_ladder_icon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
