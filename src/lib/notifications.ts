import type { Lang } from "@/lib/i18n";
// Central registry of the notification settings a player can toggle, and the
// single source of truth for how each one is stored and labelled. The Settings
// → Notifications tab renders straight from this list — grouped into browser
// push and Discord DMs by `channel` — and each send site gates on
// isNotificationEnabled() with one of these keys, so adding or regrouping a
// notification means editing one entry plus its gate call.
//
// Some settings cover more than one underlying notification (e.g. DM_MATCH_REPORTS
// gates both the "opponent reported" nudge and the "conflicting results" prompt),
// which is why the keys are grouped rather than one-per-send-site. Push and
// Discord are deliberately separate settings even for the same event (match
// found, queue opportunity), so someone can silence one channel without losing
// the other.
//
// Storage: opt-out keys a player turned OFF are listed in
// User.notificationsDisabled (see setNotificationsDisabled in lib/account.ts).
// A setting with `field` is instead an opt-in that defaults OFF and lives in
// its own boolean column — currently the two queue-opportunity pings, each on
// its own channel.
export const NOTIFICATION_KEYS = [
  // Browser push
  "PUSH_MATCH_FOUND",
  "PUSH_QUEUE_OPPORTUNITY",
  // Discord DMs
  "DM_MATCH_FOUND",
  "DM_QUEUE_OPPORTUNITY",
  "DM_CHARACTER_GUIDE",
  "DM_MOD_MESSAGES",
  "DM_SUSPENSION",
  "DM_CANCELLATION_WARNING",
  "DM_SEASON_ROLLOVER",
  "DM_MATCH_FORFEIT",
  "DM_MATCH_REPORTS",
  "DM_DISPUTES",
  "DM_FRIENDLIES",
] as const;

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export type NotificationChannel = "push" | "discord";

/** The boolean User columns an opt-in setting is stored in. */
export type NotificationOptInField = "notifyQueueOpportunities" | "notifyQueueOpportunitiesDm";

export type NotificationDef = {
  key: NotificationKey;
  channel: NotificationChannel;
  /** Present → opt-in stored in this column; absent → opt-out in notificationsDisabled. */
  field?: NotificationOptInField;
  label: Record<Lang, string>;
  description: Record<Lang, string>;
};

export const NOTIFICATION_DEFS: readonly NotificationDef[] = [
  {
    key: "PUSH_MATCH_FOUND",
    channel: "push",
    label: { en: "Match Found", es: "Partida encontrada", ja: "マッチ成立" },
    description: { en: "When you're paired.", es: "Cuando te emparejan.", ja: "対戦相手が決まったとき。" },
  },
  {
    key: "PUSH_QUEUE_OPPORTUNITY",
    channel: "push",
    field: "notifyQueueOpportunities",
    label: { en: "Matchable opponent in queue", es: "Rival compatible en la cola", ja: "待機中にマッチしうる相手" },
    description: {
      en: "While you're not queued, when someone who could match you joins.",
      es: "Mientras no estás en la cola, cuando entra alguien que podría emparejarse contigo.",
      ja: "自分が待機していないときに、マッチ対象になりうる相手が待機列に入ったとき。",
    },
  },
  {
    key: "DM_MATCH_FOUND",
    channel: "discord",
    label: { en: "Match Found", es: "Partida encontrada", ja: "マッチ成立" },
    description: {
      en: "When you're paired, with a link to the Lobby.",
      es: "Cuando te emparejan, con un enlace a la Sala.",
      ja: "対戦相手が決まったとき。ロビーへのリンク付き。",
    },
  },
  {
    key: "DM_QUEUE_OPPORTUNITY",
    channel: "discord",
    field: "notifyQueueOpportunitiesDm",
    label: { en: "Matchable opponent in queue", es: "Rival compatible en la cola", ja: "待機中にマッチしうる相手" },
    description: {
      en: "While you're not queued, when someone who could match you joins.",
      es: "Mientras no estás en la cola, cuando entra alguien que podría emparejarse contigo.",
      ja: "自分が待機していないときに、マッチ対象になりうる相手が待機列に入ったとき。",
    },
  },
  {
    key: "DM_CHARACTER_GUIDE",
    channel: "discord",
    label: { en: "New character guides", es: "Nuevas guías de personaje", ja: "新しいキャラクター攻略" },
    description: {
      en: "When someone posts a guide for a character you follow.",
      es: "Cuando alguien publica una guía de un personaje que sigues.",
      ja: "フォロー中のキャラクターの攻略が投稿されたとき。",
    },
  },
  {
    key: "DM_MOD_MESSAGES",
    channel: "discord",
    label: { en: "Messages from Mods", es: "Mensajes de mods", ja: "モデレーターからの連絡" },
    description: {
      en: "When a mod messages you about a dispute.",
      es: "Cuando un mod te escribe sobre una disputa.",
      ja: "モデレーターから異議申立について連絡が来たとき。",
    },
  },
  {
    key: "DM_SUSPENSION",
    channel: "discord",
    label: { en: "Suspension notice", es: "Aviso de suspensión", ja: "利用停止の通知" },
    description: {
      en: "When your account is auto-suspended for cancel abuse.",
      es: "Cuando tu cuenta se suspende automáticamente por abuso de cancelaciones.",
      ja: "キャンセルの乱用によりアカウントが自動で利用停止になったとき。",
    },
  },
  {
    key: "DM_CANCELLATION_WARNING",
    channel: "discord",
    label: { en: "Cancellation warning", es: "Aviso de cancelación", ja: "キャンセル数の警告" },
    description: {
      en: "When your cancellations approach the cancel-abuse threshold.",
      es: "Cuando tus cancelaciones se acercan al umbral de abuso.",
      ja: "キャンセル数が乱用と判定される基準に近づいたとき。",
    },
  },
  {
    key: "DM_SEASON_ROLLOVER",
    channel: "discord",
    label: { en: "Season rollover", es: "Cambio de temporada", ja: "シーズンの切り替わり" },
    description: {
      en: "When a new season starts and ratings reset.",
      es: "Cuando comienza una nueva temporada y se reinician los rangos.",
      ja: "新しいシーズンが始まり、レートがリセットされたとき。",
    },
  },
  {
    key: "DM_MATCH_FORFEIT",
    channel: "discord",
    label: { en: "Set Forfeit for inactivity", es: "Set perdido por inactividad", ja: "放置による不戦敗" },
    description: {
      en: "When your set is auto-forfeited for not picking a character or confirming a report in time.",
      es: "Cuando tu set se pierde automáticamente por no elegir personaje o confirmar un reporte a tiempo.",
      ja: "キャラクター選択や結果報告の確認が時間内に行われず、セットが自動で不戦敗になったとき。",
    },
  },
  {
    key: "DM_MATCH_REPORTS",
    channel: "discord",
    label: { en: "Match reports", es: "Reportes de partida", ja: "試合結果の報告" },
    description: {
      en: "When an opponent's result is waiting on you, or conflicting reports need re-confirming.",
      es: "Cuando el resultado de tu rival espera tu confirmación, o hay reportes en conflicto que reconfirmar.",
      ja: "相手の報告した結果の確認待ちになったとき、または報告が食い違って再確認が必要なとき。",
    },
  },
  {
    key: "DM_DISPUTES",
    channel: "discord",
    label: { en: "Disputes", es: "Disputas", ja: "異議申立" },
    description: {
      en: "When a dispute is opened for a mod to review, or is resolved.",
      es: "Cuando una disputa se abre para revisión de un mod o se resuelve.",
      ja: "異議申立がモデレーターの確認に回ったとき、または解決したとき。",
    },
  },
  {
    key: "DM_FRIENDLIES",
    channel: "discord",
    label: { en: "Friendlies", es: "Friendlies", ja: "フリー対戦" },
    description: {
      en: "When a Friendlies post matches you, or someone joins your post.",
      es: "Cuando una publicación de Friendlies coincide contigo o alguien se une a tu publicación.",
      ja: "フリー対戦の募集が自分の条件に合ったとき、または自分の募集に参加があったとき。",
    },
  },
];

const DEFS_BY_KEY = new Map(NOTIFICATION_DEFS.map((def) => [def.key, def]));

// The keys the opt-out `notificationsDisabled` set is rebuilt from — every
// setting that isn't stored in an opt-in column of its own.
export const CONFIGURABLE_NOTIFICATION_KEYS: readonly NotificationKey[] = NOTIFICATION_DEFS.filter(
  (def) => !def.field,
).map((def) => def.key);

/** The shape every gate needs — a slice of the User row, not the whole thing. */
export type NotificationPrefs = Partial<Record<NotificationOptInField, boolean>> & {
  notificationsDisabled?: string[];
};

export function isNotificationEnabled(prefs: NotificationPrefs, key: NotificationKey): boolean {
  const def = DEFS_BY_KEY.get(key);
  if (!def) return true;
  if (def.field) return prefs[def.field] ?? false;
  return !(prefs.notificationsDisabled?.includes(key) ?? false);
}

// Rebuilds notificationsDisabled from the set of keys left checked in the
// form. Unknown/leftover keys are dropped so a stale or tampered submission
// can't smuggle an arbitrary string into the column.
export function disabledKeysFromEnabled(enabled: Iterable<string>): string[] {
  const enabledSet = new Set(enabled);
  return CONFIGURABLE_NOTIFICATION_KEYS.filter((key) => !enabledSet.has(key));
}
