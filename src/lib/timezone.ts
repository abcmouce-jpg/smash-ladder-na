// Every "which day did this happen on" check across the site (daily stream
// stats, first-of-day achievements) sticks to one reference timezone rather
// than the server's (UTC on Vercel) or each viewer's own — otherwise the
// same match could be "today" for one viewer and "yesterday" for another.
// Matches the America/New_York already hardcoded for season deadlines
// elsewhere (rules, leaderboard pages).
export const LADDER_TIME_ZONE = "America/New_York";

// "YYYY-MM-DD" for the given date as it falls in timeZone — en-CA happens to
// format that way natively, no manual part-assembly needed.
export function dayKeyInTimeZone(date: Date, timeZone: string = LADDER_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
}

function offsetMinutesFor(date: Date, timeZone: string): number {
  const offsetName =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetName.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

// The UTC instant of local midnight, in timeZone, on the calendar day `date`
// falls on there — used as the boundary for "today" queries against
// UTC-stored timestamps (confirmedAt, etc).
export function startOfDayInTimeZone(date: Date, timeZone: string = LADDER_TIME_ZONE): Date {
  const [y, m, d] = dayKeyInTimeZone(date, timeZone).split("-").map(Number);
  const utcMidnightGuess = new Date(Date.UTC(y, m - 1, d));
  return new Date(utcMidnightGuess.getTime() - offsetMinutesFor(utcMidnightGuess, timeZone) * 60_000);
}
