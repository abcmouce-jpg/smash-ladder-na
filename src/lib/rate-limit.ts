import { LocalizedError } from "@/lib/localized-error";
// A DB-backed rate limit rather than an in-memory counter, since the app
// runs across serverless/multi-instance deployments where in-process state
// wouldn't be shared. Reuses each action's existing createdAt-style column
// instead of a dedicated counters table.
export async function enforceRateLimit(opts: { count: () => Promise<number>; limit: number; windowLabel: string }) {
  const count = await opts.count();
  if (count >= opts.limit) {
    throw new LocalizedError({
      en: `Too many requests — please slow down (limit: ${opts.limit} per ${opts.windowLabel}).`,
      es: `Demasiadas solicitudes — ve más despacio (límite: ${opts.limit} por ${opts.windowLabel}).`,
      ja: `操作が多すぎます。少し間を置いてください（上限: ${opts.windowLabel}あたり${opts.limit}回）。`,
    });
  }
}

export function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000);
}
