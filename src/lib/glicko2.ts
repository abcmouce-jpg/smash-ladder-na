// Glicko-2 (Mark Glickman, 2013) — the rating system a season runs on when its
// Season.algorithm is GLICKO2. Ratings use the same 1500-centered, ~400-point
// scale as this ladder's Elo (Glicko-2's own 1500/173.7178 normalization is
// internal to this file), so rank tiers, matchmaking gaps, and every display
// surface keep meaning the same numbers they always did.
//
// Modelled as the paper's general "rating period": a player's rating moves once
// per period against every opponent in it. This ladder confirms matches one at
// a time, so in practice a period is a single game (see applyGlicko2Result),
// but keeping the general form here is what lets the implementation be checked
// against Glickman's published worked example (glicko2.test.ts) and leaves room
// to batch later without rewriting the math.
//
// Pure functions only — no Prisma, no I/O.

// Conversion between a rating on the ladder's 1500 scale and Glicko-2's
// internal μ/φ scale.
const SCALE = 173.7178;

export const GLICKO2_INITIAL_RATING = 1500;
export const GLICKO2_INITIAL_RD = 350;
export const GLICKO2_INITIAL_VOLATILITY = 0.06;

// System constant τ (tau), which bounds how much a player's volatility can move
// in one rating period. 0.5 is Glickman's own recommended default and what most
// implementations (including this one) settle on.
export const GLICKO2_TAU = 0.5;

// Convergence threshold for the volatility root-find below.
const CONVERGENCE = 1e-6;

// A player's full Glicko-2 state. `rating` shares the Elo scale; `rd` is the
// rating deviation in the same rating points (350 = maximum uncertainty for a
// fresh player); `volatility` is the dimensionless σ.
export type Glicko2State = {
  rating: number;
  rd: number;
  volatility: number;
};

// One game within a rating period: the opponent's state as it was at the START
// of the period, and this player's score (1 win / 0 loss — no draws here).
export type Glicko2Game = {
  opponentRating: number;
  opponentRd: number;
  score: 0 | 1;
};

export function initialGlicko2State(): Glicko2State {
  return {
    rating: GLICKO2_INITIAL_RATING,
    rd: GLICKO2_INITIAL_RD,
    volatility: GLICKO2_INITIAL_VOLATILITY,
  };
}

// g(φ) — how much an opponent's own uncertainty is discounted when their result
// is counted. A near-certain opponent (small φ) counts close to fully.
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// E — the expected score for `mu` against an opponent of (muOpp, gPhiOpp).
function expectedScore(mu: number, muOpp: number, gPhiOpp: number): number {
  return 1 / (1 + Math.exp(-gPhiOpp * (mu - muOpp)));
}

// New volatility σ' via the Illinois algorithm from the paper's step 5. `v` is
// the estimated variance of the player's rating, `delta` the estimated
// improvement, both accumulated over the period.
function newVolatility(phi: number, v: number, delta: number, volatility: number): number {
  const a = Math.log(volatility * volatility);
  const phiSq = phi * phi;
  const deltaSq = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const numerator = ex * (deltaSq - phiSq - v - ex);
    const denominator = 2 * (phiSq + v + ex) ** 2;
    return numerator / denominator - (x - a) / (GLICKO2_TAU * GLICKO2_TAU);
  };

  let A = a;
  let B: number;
  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * GLICKO2_TAU) < 0) k++;
    B = a - k * GLICKO2_TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(B / 2);
}

// Advances one player's state through a rating period (steps 1–8 of the paper).
export function applyGlicko2Period(player: Glicko2State, games: Glicko2Game[]): Glicko2State {
  const mu = (player.rating - GLICKO2_INITIAL_RATING) / SCALE;
  const phi = player.rd / SCALE;

  // Zero games is a legal period (a player who sat out): only volatility and
  // thus RD drift, the rating itself is unchanged.
  if (games.length === 0) {
    const sigmaPrime = newVolatility(phi, 0, 0, player.volatility);
    const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
    return {
      rating: player.rating,
      rd: SCALE * phiStar,
      volatility: sigmaPrime,
    };
  }

  let vInv = 0; // Σ g(φ_j)² E (1−E)
  let deltaSum = 0; // Σ g(φ_j)(s_j − E)
  for (const game of games) {
    const muOpp = (game.opponentRating - GLICKO2_INITIAL_RATING) / SCALE;
    const phiOpp = game.opponentRd / SCALE;
    const gOpp = g(phiOpp);
    const e = expectedScore(mu, muOpp, gOpp);
    vInv += gOpp * gOpp * e * (1 - e);
    deltaSum += gOpp * (game.score - e);
  }

  const v = 1 / vInv;
  const delta = v * deltaSum;

  const sigmaPrime = newVolatility(phi, v, delta, player.volatility);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: GLICKO2_INITIAL_RATING + SCALE * muPrime,
    rd: SCALE * phiPrime,
    volatility: sigmaPrime,
  };
}

// Applies a single game between two players, each a full Glicko-2 state, and
// returns both NEW states. Each side's period is computed against the OTHER
// side's pre-game rating and RD — which is why both states must be passed in
// together rather than updated one at a time.
export function applyGlicko2Result(
  p1: Glicko2State,
  p2: Glicko2State,
  p1Score: 0 | 1,
): { p1: Glicko2State; p2: Glicko2State } {
  return {
    p1: applyGlicko2Period(p1, [{ opponentRating: p2.rating, opponentRd: p2.rd, score: p1Score }]),
    p2: applyGlicko2Period(p2, [{ opponentRating: p1.rating, opponentRd: p1.rd, score: p1Score === 1 ? 0 : 1 }]),
  };
}
