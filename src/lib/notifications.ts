// Central registry of every notification a player can receive, and the single
// source of truth for which ones are user-configurable. The Settings →
// Notifications tab renders straight from this list, and each send site gates
// on isNotificationEnabled() with the key defined here — so adding a new
// notification means adding one entry plus one gate call, rather than touching
// storage, the settings form, and its copy separately.
//
// Storage: opt-out types a player has turned off are listed in
// User.notificationsDisabled (see setNotificationsDisabled in lib/account.ts).
// Two deliberate exceptions:
//   - `critical` types (account/conduct notices and direct mod messages) are
//     always sent. A player can't silence "your account was suspended", and a
//     mod shouldn't lose their channel for reaching someone about a dispute.
//   - `optIn` types carry their own boolean column (notifyQueueOpportunities),
//     because they default OFF and predate this registry.
export const NOTIFICATION_KEYS = [
  // Browser push
  "PUSH_MATCH_FOUND",
  "PUSH_QUEUE_OPPORTUNITY",
  "PUSH_CHARACTER_GUIDE",
  // Discord DMs — player-facing
  "DM_MATCH_FOUND",
  "DM_MATCH_TIMEOUT",
  "DM_REPORT_REMINDER",
  "DM_REPORT_CONFLICT",
  "DM_DISPUTE_OPENED",
  "DM_DISPUTE_RESOLVED",
  "DM_FRIENDLIES",
  "DM_TOURNAMENT",
  "DM_SEASON_ROLLOVER",
  // Discord DMs — mod-facing
  "DM_MOD_DISPUTE_ALERT",
  "DM_MOD_MATCH_ALERT",
  // Discord DMs — always sent (not user-configurable)
  "DM_CANCEL_WARNING",
  "DM_SUSPENSION",
  "DM_MOD_MESSAGE",
] as const;

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export type NotificationChannel = "push" | "discord";
export type NotificationAudience = "player" | "mod";

export type NotificationDef = {
  key: NotificationKey;
  channel: NotificationChannel;
  audience: NotificationAudience;
  /** Always sent — the settings UI shows it as locked rather than a toggle. */
  critical?: boolean;
  /** Stored in its own boolean column (currently notifyQueueOpportunities) rather than notificationsDisabled. */
  optIn?: boolean;
  label: { en: string; es: string };
  description: { en: string; es: string };
};

export const NOTIFICATION_DEFS: readonly NotificationDef[] = [
  {
    key: "PUSH_MATCH_FOUND",
    channel: "push",
    audience: "player",
    label: { en: "Match found", es: "Partida encontrada" },
    description: {
      en: "A browser notification when you're paired.",
      es: "Una notificación del navegador cuando te emparejan.",
    },
  },
  {
    key: "PUSH_QUEUE_OPPORTUNITY",
    channel: "push",
    audience: "player",
    optIn: true,
    label: { en: "Matchable opponent in queue", es: "Rival compatible en la cola" },
    description: {
      en: "While you're not queued, a browser notification when someone who could match you joins.",
      es: "Mientras no estás en la cola, una notificación del navegador cuando entra alguien que podría emparejarse contigo.",
    },
  },
  {
    key: "PUSH_CHARACTER_GUIDE",
    channel: "push",
    audience: "player",
    label: { en: "New character guides", es: "Nuevas guías de personaje" },
    description: {
      en: "When someone posts a guide for a character you follow.",
      es: "Cuando alguien publica una guía de un personaje que sigues.",
    },
  },
  {
    key: "DM_MATCH_FOUND",
    channel: "discord",
    audience: "player",
    label: { en: "Match found", es: "Partida encontrada" },
    description: {
      en: "A Discord DM when you're paired, with a link to the Lobby.",
      es: "Un MD de Discord cuando te emparejan, con un enlace a la Sala.",
    },
  },
  {
    key: "DM_MATCH_TIMEOUT",
    channel: "discord",
    audience: "player",
    label: { en: "Set forfeited for inactivity", es: "Set perdido por inactividad" },
    description: {
      en: "A DM when your set is auto-forfeited because you didn't pick a character or confirm a report in time.",
      es: "Un MD cuando tu set se pierde automáticamente porque no elegiste personaje o no confirmaste un reporte a tiempo.",
    },
  },
  {
    key: "DM_REPORT_REMINDER",
    channel: "discord",
    audience: "player",
    label: { en: "Opponent reported a result", es: "Tu rival reportó un resultado" },
    description: {
      en: "A DM when your opponent reports a game result and it's waiting on your confirm or dispute.",
      es: "Un MD cuando tu rival reporta el resultado de una partida y espera tu confirmación.",
    },
  },
  {
    key: "DM_REPORT_CONFLICT",
    channel: "discord",
    audience: "player",
    label: { en: "Conflicting results", es: "Resultados en conflicto" },
    description: {
      en: "A DM when you and your opponent report different results and need to re-confirm.",
      es: "Un MD cuando tú y tu rival reportan resultados distintos y deben reconfirmar.",
    },
  },
  {
    key: "DM_DISPUTE_OPENED",
    channel: "discord",
    audience: "player",
    label: { en: "Dispute opened", es: "Disputa abierta" },
    description: {
      en: "A DM when a conflicting report is escalated for a mod to review.",
      es: "Un MD cuando un reporte conflictivo se escala para revisión de un mod.",
    },
  },
  {
    key: "DM_DISPUTE_RESOLVED",
    channel: "discord",
    audience: "player",
    label: { en: "Dispute resolved", es: "Disputa resuelta" },
    description: {
      en: "A DM when a mod resolves a disputed game.",
      es: "Un MD cuando un mod resuelve una partida en disputa.",
    },
  },
  {
    key: "DM_FRIENDLIES",
    channel: "discord",
    audience: "player",
    label: { en: "Friendlies", es: "Friendlies" },
    description: {
      en: "A DM when a Friendlies post matches you (requires the Discord @Matchmaking role), or when someone joins your post.",
      es: "Un MD cuando una publicación de Friendlies coincide contigo (requiere el rol @Matchmaking de Discord), o cuando alguien se une a tu publicación.",
    },
  },
  {
    key: "DM_TOURNAMENT",
    channel: "discord",
    audience: "player",
    label: { en: "Tournament starting", es: "Torneo por comenzar" },
    description: {
      en: "A DM when a tournament you entered starts.",
      es: "Un MD cuando comienza un torneo en el que te inscribiste.",
    },
  },
  {
    key: "DM_SEASON_ROLLOVER",
    channel: "discord",
    audience: "player",
    label: { en: "Season rollover", es: "Cambio de temporada" },
    description: {
      en: "A DM when your in-progress match is cancelled because a season ended.",
      es: "Un MD cuando tu partida en curso se cancela porque terminó la temporada.",
    },
  },
  {
    key: "DM_MOD_DISPUTE_ALERT",
    channel: "discord",
    audience: "mod",
    label: { en: "New dispute alerts", es: "Alertas de nuevas disputas" },
    description: {
      en: "A DM to mods/admins when a game dispute is opened.",
      es: "Un MD a mods/admins cuando se abre una disputa entre jugadores.",
    },
  },
  {
    key: "DM_MOD_MATCH_ALERT",
    channel: "discord",
    audience: "mod",
    label: { en: "Auto-resolved match alerts", es: "Alertas de partidas auto-resueltas" },
    description: {
      en: "A DM to mods/admins when a match is auto-forfeited, auto-confirmed, or expires unreported.",
      es: "Un MD a mods/admins cuando una partida se auto-otorga, se auto-confirma o expira sin reporte.",
    },
  },
  {
    key: "DM_CANCEL_WARNING",
    channel: "discord",
    audience: "player",
    critical: true,
    label: { en: "Cancellation warnings", es: "Avisos de cancelación" },
    description: {
      en: "A DM when your cancellations approach the cancel-abuse threshold. Always sent.",
      es: "Un MD cuando tus cancelaciones se acercan al umbral de abuso. Siempre se envía.",
    },
  },
  {
    key: "DM_SUSPENSION",
    channel: "discord",
    audience: "player",
    critical: true,
    label: { en: "Suspension notices", es: "Avisos de suspensión" },
    description: {
      en: "A DM when your account is auto-suspended. Always sent.",
      es: "Un MD cuando tu cuenta se suspende automáticamente. Siempre se envía.",
    },
  },
  {
    key: "DM_MOD_MESSAGE",
    channel: "discord",
    audience: "player",
    critical: true,
    label: { en: "Messages from mods", es: "Mensajes de mods" },
    description: {
      en: "A DM when a mod messages you about a dispute. Always sent.",
      es: "Un MD cuando un mod te escribe sobre una disputa. Siempre se envía.",
    },
  },
];

const DEFS_BY_KEY = new Map(NOTIFICATION_DEFS.map((def) => [def.key, def]));

// The keys a player actually toggles — everything except the always-sent ones
// (critical) and the opt-in one tracked by its own column. The settings save
// path uses this to rebuild notificationsDisabled from what was left checked.
export const CONFIGURABLE_NOTIFICATION_KEYS: readonly NotificationKey[] = NOTIFICATION_DEFS.filter(
  (def) => !def.critical && !def.optIn,
).map((def) => def.key);

/** The shape every gate needs — a slice of the User row, not the whole thing. */
export type NotificationPrefs = {
  notificationsDisabled: string[];
  notifyQueueOpportunities?: boolean;
};

export function isNotificationEnabled(prefs: NotificationPrefs, key: NotificationKey): boolean {
  const def = DEFS_BY_KEY.get(key);
  if (!def) return true;
  if (def.critical) return true;
  if (def.optIn) return prefs.notifyQueueOpportunities ?? false;
  return !prefs.notificationsDisabled.includes(key);
}

// Rebuilds notificationsDisabled from the set of keys left checked in the
// form. Unknown/leftover keys are dropped so a stale or tampered submission
// can't smuggle an arbitrary string into the column.
export function disabledKeysFromEnabled(enabled: Iterable<string>): string[] {
  const enabledSet = new Set(enabled);
  return CONFIGURABLE_NOTIFICATION_KEYS.filter((key) => !enabledSet.has(key));
}
