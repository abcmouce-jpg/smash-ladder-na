// A DB-backed rate limit rather than an in-memory counter, since the app
// runs across serverless/multi-instance deployments where in-process state
// wouldn't be shared. Reuses each action's existing createdAt-style column
// instead of a dedicated counters table.
export async function enforceRateLimit(opts: {
  count: () => Promise<number>;
  limit: number;
  windowLabel: string;
}) {
  const count = await opts.count();
  if (count >= opts.limit) {
    throw new Error(
      `Too many requests — please slow down (limit: ${opts.limit} per ${opts.windowLabel}).`,
    );
  }
}

export function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000);
}
