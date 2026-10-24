// Chat message translation via Vercel AI Gateway (OpenAI-compatible REST API,
// no SDK dependency needed for a single-purpose call like this). Auth follows
// the gateway's documented fallback: AI_GATEWAY_API_KEY locally,
// VERCEL_OIDC_TOKEN automatically once deployed on Vercel — so production
// needs no key of its own.
import type { Lang } from "@/lib/i18n";

const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = "openai/gpt-4.1-nano";

const LANG_NAMES: Record<Lang, string> = { en: "English", es: "Spanish", ja: "Japanese" };

// Chat messages are short and casual, so a translation failure (missing key,
// gateway hiccup, rate limit) should never break the chat itself — callers
// treat a thrown error as "show the original text instead."
export async function translateText(text: string, targetLang: Lang): Promise<string> {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) throw new Error("No AI Gateway credentials available");

  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `Translate the user's chat message to ${LANG_NAMES[targetLang]}. ` +
            `If it's already in ${LANG_NAMES[targetLang]}, return it unchanged. ` +
            "This is casual matchmaking chat between two players, not a formal document — keep slang, " +
            "abbreviations, and tone as-is. Reply with ONLY the translated text, no quotes, no explanation.",
        },
        { role: "user", content: text },
      ],
      temperature: 0,
    }),
  });

  if (!res.ok) throw new Error(`AI Gateway translation failed: ${res.status}`);
  const data = await res.json();
  const translated = data.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("AI Gateway returned no translation");
  return translated;
}
