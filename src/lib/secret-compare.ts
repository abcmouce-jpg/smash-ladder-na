import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compares a value supplied by a caller against a secret we hold, without
 * letting the comparison itself say how much of the guess was right.
 *
 * `===` on strings stops at the first byte that differs, so how long it takes
 * is a function of the shared prefix. That is a weak signal over the public
 * internet and a slow thing to exploit, but it is the one piece of a bearer
 * check that can be made free of the problem outright, so there is no reason
 * to keep the cheaper form.
 *
 * Both sides are hashed first so timingSafeEqual always gets equal-length
 * buffers (it throws otherwise) and a wrong-length guess costs the same as a
 * wrong-value one, rather than failing early and revealing the length.
 */
export function secretEquals(supplied: string | null | undefined, secret: string | null | undefined): boolean {
  if (!supplied || !secret) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/**
 * Whether a request carries `Authorization: Bearer <secret>`. Returns false
 * when the secret isn't configured, so a deployment that forgot to set it is
 * closed rather than open.
 */
export function hasBearerSecret(request: Request, secret: string | null | undefined): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return secretEquals(header.slice("Bearer ".length).trim(), secret);
}
