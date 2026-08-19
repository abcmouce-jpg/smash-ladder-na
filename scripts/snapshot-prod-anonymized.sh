#!/usr/bin/env bash
# Pulls a data snapshot from production (read-only) into a local file, then
# restores it into the local dev database with all personally-identifying
# fields stripped or scrambled. Used to give contributors realistic-scale
# data (rating distributions, match history, season standings, etc.) for
# building things like a statistics page, without exposing real users'
# emails, IPs, Discord/Twitch/start.gg identities, private messages, or
# moderation history.
#
# Only reads from production (pg_dump) and only writes to the LOCAL dev
# database (TARGET_URL below) — never touches production data.
#
# Usage: ./scripts/snapshot-prod-anonymized.sh
# Requires:
#   - .env.production.local with a production DATABASE_URL (only the
#     project owner has this — this script isn't runnable by every
#     contributor, only whoever generates the snapshot to share)
#   - a local Postgres with the dev DB already migrated (npx prisma migrate
#     dev) — reads its connection info from .env.development by default,
#     same as `npm run dev` uses, so this matches the repo's documented
#     Docker-based setup (see README's Getting Started). Override with
#     TARGET_DATABASE_URL if your local setup differs.

set -euo pipefail
cd "$(dirname "$0")/.."

# Neon (production) runs Postgres 18 — the system pg_dump (via `brew install
# postgresql`) may be an older major version and will refuse to dump against
# a newer server. Prefer a matching-or-newer pg_dump/psql if postgresql@18
# is installed (`brew install postgresql@18`, kept unlinked so it doesn't
# disturb whatever server version is actually running locally).
PG_BIN="/opt/homebrew/opt/postgresql@18/bin"
if [ -x "$PG_BIN/pg_dump" ]; then
  PG_DUMP="$PG_BIN/pg_dump"
  PSQL="$PG_BIN/psql"
else
  PG_DUMP="pg_dump"
  PSQL="psql"
fi

PROD_URL=$(grep -E '^DATABASE_URL=' .env.production.local | head -1 | cut -d'=' -f2- | tr -d '"')
TARGET_URL="${TARGET_DATABASE_URL:-$(grep -E '^DATABASE_URL=' .env.development | head -1 | cut -d'=' -f2- | tr -d '"')}"
DUMP_FILE="/tmp/smash-ladder-anon-snapshot.sql"

# Tables worth keeping for stats: match/rating/season/tournament history and
# users themselves. Deliberately excluded: Account/Session/VerificationToken
# (OAuth tokens, session secrets), BannedIp (IP addresses), PushSubscription
# (push endpoints), MatchComment/MatchCommentTranslation (private chat
# content), ConductReport/ConnectionReport (moderation case history — often
# names real incidents), FreeBattlePost (free-text posts).
TABLES=(
  "User" "RatingMatch" "MatchGame" "RatingHistory" "Season" "SeasonStanding"
  "RatingLobbyEntry" "Tournament" "TournamentEntry" "Block" "KofiDonation"
)
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(-t "public.\"$t\"")
done

echo "==> Dumping ${#TABLES[@]} tables from production (read-only)..."
"$PG_DUMP" "$PROD_URL" --data-only --no-owner --no-privileges --disable-triggers "${TABLE_ARGS[@]}" > "$DUMP_FILE"
echo "==> Dump written to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

echo "==> Clearing local dev DB tables (local only, disposable dev data)..."
"$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 -c "
TRUNCATE TABLE
  \"TournamentEntry\", \"Tournament\", \"SeasonStanding\", \"Season\",
  \"RatingHistory\", \"MatchGame\", \"RatingLobbyEntry\", \"RatingMatch\",
  \"Block\", \"KofiDonation\", \"User\"
RESTART IDENTITY CASCADE;
"

echo "==> Restoring snapshot into local dev DB..."
"$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE" > /dev/null

echo "==> Anonymizing personally-identifying fields (local DB only)..."
# username is included here, not just discordUsername/email — it's a
# self-editable free-text field, and at least one real account was found
# with their actual email address typed in as their site username. A
# free-text field can't be pattern-matched into safety (that's how the
# email-shaped one was caught, but nothing guarantees the next PII isn't
# shaped like a phone number, a real name, or something with no detectable
# pattern at all) — replaced wholesale with a synthetic handle instead of
# trying to selectively scrub it.
"$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 -c "
UPDATE \"User\" SET
  username = 'Player' || numbered.rn,
  \"discordId\" = 'dev-' || \"User\".id,
  \"discordUsername\" = NULL,
  email = NULL,
  \"avatarUrl\" = NULL,
  \"lastKnownIp\" = NULL,
  \"arenaPassword\" = NULL,
  \"startggUserId\" = NULL,
  \"startggPlayerId\" = NULL,
  \"startggSlug\" = NULL,
  \"startggGamerTag\" = NULL,
  \"startggConnectedAt\" = NULL,
  \"twitchUserId\" = NULL,
  \"twitchUsername\" = NULL,
  \"twitchDisplayName\" = NULL,
  \"twitchProfileImageUrl\" = NULL,
  \"twitchConnectedAt\" = NULL
FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM \"User\") AS numbered
WHERE \"User\".id = numbered.id;

UPDATE \"RatingLobbyEntry\" SET \"existingRoomCode\" = NULL;

UPDATE \"KofiDonation\" SET \"fromName\" = 'Supporter', message = NULL;
"

rm -f "$DUMP_FILE"

echo "==> Done. Local dev DB now has an anonymized production-scale snapshot."
echo "    Ratings, match history, and season data are kept — usernames were"
echo "    replaced with synthetic ones, and emails, IPs, Discord/Twitch/"
echo "    start.gg identities, and chat/report content were stripped or"
echo "    never dumped."
