"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

type GenerateApiTokenState = { error: string | null; rawToken: string | null };

type ApiTokenSummary = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export function ApiTokensPanel({
  tokens,
  generateAction,
  revokeAction,
  lang = "en",
}: {
  tokens: ApiTokenSummary[];
  generateAction: (prevState: GenerateApiTokenState, formData: FormData) => Promise<GenerateApiTokenState>;
  revokeAction: (tokenId: string) => Promise<void>;
  lang?: Lang;
}) {
  const [state, formAction, isPending] = useActionState(generateAction, { error: null, rawToken: null });
  const [revokingId, setRevokingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: "For external clients (like the Switch app) that need to act on your behalf — joining the queue, etc.",
          es: "Para clientes externos (como la app de Switch) que necesitan actuar en tu nombre — unirse a la cola, etc.",
          ja: "Switch アプリなど、あなたの代わりに操作する外部クライアント用です（待機への参加など）。",
        })}
      </p>

      {tokens.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{token.name}</span>
                <span className="text-xs text-muted-foreground">
                  {tr(lang, { en: "Created", es: "Creado", ja: "作成日" })}{" "}
                  {new Date(token.createdAt).toLocaleDateString()}
                  {token.lastUsedAt &&
                    ` · ${tr(lang, { en: "Last used", es: "Usado", ja: "最終使用" })} ${new Date(token.lastUsedAt).toLocaleDateString()}`}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={revokingId === token.id}
                onClick={async () => {
                  setRevokingId(token.id);
                  await revokeAction(token.id);
                  setRevokingId(null);
                }}
              >
                {tr(lang, { en: "Revoke", es: "Revocar", ja: "失効させる" })}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {tr(lang, { en: "Token name", es: "Nombre del token", ja: "トークン名" })}
          <input
            name="name"
            type="text"
            maxLength={50}
            placeholder={tr(lang, { en: "e.g. Switch UI", es: "p. ej. Switch UI", ja: "例：Switch UI" })}
            className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </label>
        <Button type="submit" size="sm" disabled={isPending}>
          {tr(lang, { en: "Generate", es: "Generar", ja: "発行する" })}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.rawToken && (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium text-foreground">
            {tr(lang, {
              en: "Copy this now — it won't be shown again:",
              es: "Copia esto ahora — no se volverá a mostrar:",
              ja: "この場で控えてください。二度と表示されません：",
            })}
          </p>
          <code className="break-all rounded bg-background px-2 py-1 text-xs">{state.rawToken}</code>
        </div>
      )}
    </div>
  );
}
