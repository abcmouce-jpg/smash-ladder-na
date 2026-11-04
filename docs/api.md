# Public API

One endpoint, read-only and unauthenticated: the ranking export. It exists so
a tournament can seed a bracket from the ladder instead of guessing, which is
what SPSP asked for.

Everything it returns is already on `/leaderboard` and the public profiles, so
there is no key to request and nothing here is private.

| Instance | Base URL |
| --- | --- |
| Japan | `https://smash-ladder-jp.vercel.app` |
| North America | `https://nasmashmate.com` |

The two run the same code against separate databases. A player on one is not a
player on the other.

## `GET /api/v1/rankings`

```
GET /api/v1/rankings?limit=500&offset=0
```

| Parameter | Default | Notes |
| --- | --- | --- |
| `limit` | 500 | Clamped to 1–1000. |
| `offset` | 0 | For paging; the board is small enough that two requests cover it today. |

Cached for 60 seconds at the edge. Polling faster than that returns the same
bytes, so don't.

### Response

```jsonc
{
  "site": "Smash Ladder NA",
  "season": {
    "name": "Season 1",
    "startsAt": "2026-09-25T19:13:48.045Z",
    "scheduledEndAt": "2026-11-26T01:00:00.000Z"   // null if none is set
  },
  "ratingSystem": "glicko2",       // "elo" | "glicko2"
  "ratingAlgorithm": "GLICKO2",    // "ELO" | "GLICKO2" | "SMASHMATE" | null
  "minimumSetsToRank": 5,
  "totalCount": 1106,
  "startggLinkedCount": 612,
  "limit": 2,
  "offset": 0,
  "players": [
    {
      "rank": 2,
      "username": "Glider",
      "rating": 2257,
      "gamesPlayed": 29,
      "region": "Oregon",                 // null where the instance has no regions
      "mainCharacter": "Wii Fit Trainer", // English roster name, or null
      "profileUrl": "/players/cmujal8lw000104lb43umokli",
      "startgg": {
        "userId": "1708464",
        "playerId": "2588888",
        "slug": "user/682fa48d",
        "gamerTag": "Glider"
      }
    }
  ]
}
```

**`season`** is null when none is running — the export still answers, with an
empty `players`.

**`ratingSystem`** is the family the ratings were produced by, and only ever
takes those two values. Japan's ladder runs Smashmate's math, which is Elo
with a flat K, so it reports `"elo"` there. **`ratingAlgorithm`** is the exact
answer and is the field to read if the difference matters; it is null only for
a season that predates the column. Both describe the **active season** — the
one that produced the numbers in this response — not what the site is
configured to open its next season on.

**`rating`** is a whole number. Ties share a rank and the next rank is skipped,
so two players at rank 4 are followed by rank 6 — the same as the site's own
leaderboard.

**`profileUrl`** is a path, not an absolute URL. Join it to the base URL above.

**`mainCharacter`** is the canonical English fighter name (`"Bowser"`, not
`"クッパ"`) regardless of which instance answers, because it is an identifier
rather than display text.

### Who is missing from it

Only players past `minimumSetsToRank` are listed; below that a rating isn't
public anywhere on the site, so there is nothing to export. Banned and deleted
accounts are left out too.

So an entrant absent from the export is not necessarily absent from the
ladder — they may simply not have played enough yet. Treat a miss as "no
rating available", not as "not a member".

## Seeding against start.gg

`startgg` is the join key, and it is **null for players who never connected
the account** — `startggLinkedCount` against `totalCount` tells you how much
of the board can be matched by id before you fetch a single page.

Match on `startgg.userId` (start.gg's user id) or `startgg.slug`. `gamerTag`
is there for display and for a last-resort manual match; don't key on it,
because two people can hold the same tag and only one of them owns the
account — which is the whole reason the ids are exposed.

```js
const base = "https://smash-ladder-jp.vercel.app";
const res = await fetch(`${base}/api/v1/rankings?limit=1000`);
const { players, totalCount, startggLinkedCount } = await res.json();
// Page again while players.length < totalCount, bumping offset by 1000.

const byStartggUserId = new Map(
  players.filter((p) => p.startgg?.userId).map((p) => [p.startgg.userId, p]),
);

// entrants: the bracket's entrants, each with a start.gg user id
const seeds = entrants
  .map((e) => ({ entrant: e, ladder: byStartggUserId.get(e.startggUserId) ?? null }))
  .sort((a, b) => (b.ladder?.rating ?? -Infinity) - (a.ladder?.rating ?? -Infinity));
// Unrated entrants land at the bottom; seed them by whatever you used before.
```

## Stability

Fields get added, not removed or repurposed — `ratingAlgorithm` and
`startggLinkedCount` both arrived after the first consumer did, and
`ratingSystem` kept its two values rather than growing a third when a third
algorithm shipped. Read defensively anyway: ignore fields you don't know, and
treat any of the nullable ones as absent rather than assuming a shape.

If you need something this doesn't give you, ask — it is easier to add a field
than to have you scrape the leaderboard page for it.
