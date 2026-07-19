import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // No org/project/authToken — source map upload is skipped, so stack
  // traces in Sentry won't be de-minified, but error capture itself
  // works fully without it.
});
