// Days/hours/minutes/seconds left until a season ends, for the leaderboard's
// countdown. Split into units rather than a total second count (unlike the
// lobby's Countdown) because a season is weeks away — "1,382,133s" tells
// nobody anything.
export type SeasonRemaining = { days: number; hours: number; minutes: number; seconds: number };

// Clamped at zero: the season deadline is only an estimate for the preseason,
// and the rollover itself is manual, so what "0" means is up to the caller.
// `now` is injectable so this stays testable without fake timers.
export function seasonTimeRemaining(endsAtMs: number, now = Date.now()): SeasonRemaining {
  const totalSeconds = Math.max(0, Math.floor((endsAtMs - now) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function isSeasonTimeUp(remaining: SeasonRemaining): boolean {
  return remaining.days === 0 && remaining.hours === 0 && remaining.minutes === 0 && remaining.seconds === 0;
}
