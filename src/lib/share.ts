// Share targets for a profile page. Kept out of the component so the URL
// shape is unit-testable: an unencoded share text silently truncates the
// post at the first "&" or "#", which is easy to miss by eye and impossible
// to notice without actually clicking through.

// twitter.com/intent/tweet still redirects to the x.com equivalent, and the
// older host is the one every existing share link in the wild uses.
const TWEET_INTENT = "https://twitter.com/intent/tweet";

export function tweetIntentUrl(text: string, url: string) {
  return `${TWEET_INTENT}?text=${encodeURIComponent(`${text} ${url}`)}`;
}

// The rank card is the page's own OpenGraph image: the same picture that
// unfurls when the profile link is pasted into Discord, opened directly so a
// player can save it.
export function rankCardUrl(playerId: string) {
  return `/players/${playerId}/opengraph-image`;
}
