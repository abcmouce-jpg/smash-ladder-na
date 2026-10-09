import { Card } from "@/components/ui/card";
import { RequestCorrectionForm } from "@/components/request-correction-form";
import { MatchHistoryEntry } from "@/components/match-history-entry";
import { AdminMatchOverride } from "@/components/moderation-tools";
import type { MatchHistoryEntryData } from "@/lib/players";
import type { Lang } from "@/lib/i18n";
import {
  adminCorrectOldResultAction,
  adminOverrideResultAction,
  adminUndoMatchAction,
  adminUndoOldMatchAction,
  getMatchChatLogAction,
  getMatchChatLogAsModAction,
  requestCorrectionAction,
} from "../actions";

// The card of confirmed matches shared by the overview's recent-history strip
// and the full Match History tab, so both render identical rows (details modal
// included) and the same correction / admin-override controls without the two
// call sites drifting. `matches` must already be ordered newest-first.
//
// The per-match reveal flag and which match is the player's true most recent
// real one are decided by the caller (from getHiddenRatingMatchIds and an
// unfiltered recent fetch respectively) and handed down, so a page of filtered
// or older history never changes which set the correction tools attach to.
export function MatchHistoryList({
  playerId,
  playerUsername,
  matches,
  mostRecentRealMatchId,
  hiddenChangeIds,
  isOwnProfile,
  isModerator,
  lang,
}: {
  playerId: string;
  playerUsername: string;
  matches: MatchHistoryEntryData[];
  mostRecentRealMatchId: string | null;
  hiddenChangeIds: Set<string>;
  isOwnProfile: boolean;
  isModerator: boolean;
  lang: Lang;
}) {
  return (
    <Card className="mt-4 divide-y divide-border overflow-hidden py-0">
      {matches.map((match) => (
        <MatchHistoryEntry
          key={match.id}
          match={{
            ...match,
            // Dates can't cross the server→client boundary; the modal renders
            // it back with LocalTime.
            confirmedAt: match.confirmedAt?.toISOString() ?? null,
            // Per-match reveal (see getHiddenRatingMatchIds): the active
            // season's opening sets stay hidden even after graduation.
            ratingRevealed: !hiddenChangeIds.has(match.id),
          }}
          viewedPlayerName={playerUsername}
          canSeeHiddenRatings={isModerator}
          // Own profile reads their own chat log; a mod reviewing someone
          // else's profile gets the mod spectator path. The modal is the only
          // place this renders now.
          chatLogAction={
            isOwnProfile
              ? getMatchChatLogAction.bind(null, match.id)
              : isModerator
                ? getMatchChatLogAsModAction.bind(null, match.id)
                : undefined
          }
          lang={lang}
        >
          {isOwnProfile && match.id === mostRecentRealMatchId && (
            <RequestCorrectionForm
              action={requestCorrectionAction.bind(null, match.id)}
              myId={playerId}
              opponentId={match.opponent.id}
              opponentUsername={match.opponent.username}
              lang={lang}
            />
          )}
          {isModerator && !isOwnProfile && match.id === mostRecentRealMatchId && (
            <AdminMatchOverride
              player1Username={playerUsername}
              player2Username={match.opponent.username}
              actionForPlayer1={adminOverrideResultAction.bind(null, match.id, playerId, playerId)}
              actionForPlayer2={adminOverrideResultAction.bind(null, match.id, playerId, match.opponent.id)}
              undoAction={adminUndoMatchAction.bind(null, match.id, playerId)}
            />
          )}
          {isModerator && !isOwnProfile && match.id !== mostRecentRealMatchId && (
            // Same tool, for a match the player has since queued past —
            // adminOverrideResultAction/adminUndoMatchAction require this to
            // still be each side's most recent confirmed match, which stops
            // applying the moment they play again. These use the
            // relative-delta correction instead (see
            // adminCorrectOldMatchResult/adminUndoOldMatch), so a mod can
            // still fix a bad result from days ago without needing to have
            // caught it before the player's next set.
            <AdminMatchOverride
              player1Username={playerUsername}
              player2Username={match.opponent.username}
              actionForPlayer1={adminCorrectOldResultAction.bind(null, match.id, playerId, playerId)}
              actionForPlayer2={adminCorrectOldResultAction.bind(null, match.id, playerId, match.opponent.id)}
              undoAction={adminUndoOldMatchAction.bind(null, match.id, playerId)}
            />
          )}
        </MatchHistoryEntry>
      ))}
    </Card>
  );
}
