const STARTGG_API = "https://api.start.gg/gql/alpha";

const EVENT_QUERY = `
  query TournamentLadderEvent($slug: String!) {
    event(slug: $slug) {
      name
      numEntrants
      state
      standings(query: { perPage: 8, page: 1 }) {
        nodes {
          placement
          entrant {
            name
          }
        }
      }
    }
  }
`;

type StartggEventResponse = {
  data?: {
    event: {
      name: string;
      numEntrants: number | null;
      state: string;
      standings: {
        nodes: { placement: number; entrant: { name: string } | null }[];
      } | null;
    } | null;
  };
  errors?: unknown;
};

export type StartggEventInfo = {
  eventName: string;
  numEntrants: number | null;
  isCompleted: boolean;
  standings: { placement: number; entrantName: string }[];
};

// Only a URL of the form .../tournament/<slug>/event/<slug> identifies a single
// event; a bare tournament link is ambiguous about which event to show, so we
// don't guess.
function parseEventSlug(startggUrl: string): string | null {
  const match = startggUrl.match(/start\.gg\/tournament\/([^/?#]+)\/event\/([^/?#]+)/);
  if (!match) return null;
  return `tournament/${match[1]}/event/${match[2]}`;
}

// Best-effort enrichment of the tournament page with live start.gg data. The
// page must render fine from our own DB alone if the token is missing, the
// URL doesn't resolve to a single event, or the API call fails.
export async function fetchStartggEventInfo(startggUrl: string): Promise<StartggEventInfo | null> {
  const token = process.env.STARTGG_API_TOKEN;
  if (!token) return null;
  const slug = parseEventSlug(startggUrl);
  if (!slug) return null;

  try {
    const res = await fetch(STARTGG_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: EVENT_QUERY, variables: { slug } }),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as StartggEventResponse;
    if (json.errors || !json.data?.event) return null;

    const event = json.data.event;
    const isCompleted = event.state === "COMPLETED";
    return {
      eventName: event.name,
      numEntrants: event.numEntrants,
      isCompleted,
      standings: isCompleted
        ? (event.standings?.nodes ?? [])
            .filter((n): n is { placement: number; entrant: { name: string } } => n.entrant !== null)
            .map((n) => ({ placement: n.placement, entrantName: n.entrant.name }))
        : [],
    };
  } catch {
    return null;
  }
}
