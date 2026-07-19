import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Small ladder, low traffic — full session replay isn't needed and
  // would just burn quota; keep to error capture.
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
