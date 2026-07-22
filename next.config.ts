import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// No script-src: AdSense and Sentry inject at runtime, so that needs a nonce pipeline first
// No HSTS either, Vercel already sets it
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // No org/project/authToken — source map upload is skipped, so stack
  // traces in Sentry won't be de-minified, but error capture itself
  // works fully without it.
});
