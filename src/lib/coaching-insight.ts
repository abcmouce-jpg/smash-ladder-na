import type { PersonalAnalytics, WinRateRow } from "@/lib/player-analytics";

// Same gateway/model/auth pattern as translate.ts — a single-purpose REST
// call, no SDK. See that file for why no key is needed in production
// (Vercel OIDC).
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = "openai/gpt-4.1-nano";

function formatRows(rows: WinRateRow[]): string {
  if (rows.length === 0) return "none";
  return rows.map((r) => `${r.label}: ${r.wins}-${r.losses} (${Math.round(r.winRate * 100)}%)`).join("; ");
}

// Strict fact-restatement prompt — this must never produce speculation,
// advice, or inferred causes. The model is explicitly told to say nothing
// it can't point to a number for, and temperature 0 + an exact data dump
// (not a vague description) is what makes that followable rather than just
// requested.
const SYSTEM_PROMPT =
  "You summarize a competitive video game player's own match statistics into 2-3 short, plain sentences. " +
  "You may ONLY restate the exact numbers given below in natural language — nothing else. " +
  "Do NOT speculate about causes, playstyle, strengths, weaknesses, mental state, or skill. " +
  "Do NOT give advice, suggestions, or recommendations of any kind. " +
  "Do NOT infer or imply anything that isn't a direct restatement of a number provided. " +
  "If a category has fewer than 3 games, you may note the sample is small, but draw no conclusion from it. " +
  "Avoid words like 'struggle', 'excel', 'strong', 'weak', 'tend to', or 'because' unless directly quoting a " +
  "stated number change. Output only the summary sentences — no preamble, no markdown, no bullet points.";

// Failures here are never load-bearing — callers (see
// getOrGenerateCoachingInsight in player-analytics.ts) treat a thrown error
// as "fall back to whatever was cached before."
export async function generateCoachingInsightText(stats: PersonalAnalytics): Promise<string> {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) throw new Error("No AI Gateway credentials available");

  const first = stats.ratingTrend[0]?.rating;
  const last = stats.ratingTrend.at(-1)?.rating;
  const ratingLine =
    first !== undefined && last !== undefined
      ? `Rating went from ${Math.round(first)} to ${Math.round(last)} over ${stats.ratingTrend.length} recorded changes.`
      : "No rating history recorded yet.";

  const dataDump = [
    ratingLine,
    `Win/loss record by character played: ${formatRows(stats.characterWinRates)}.`,
    `Win/loss record by stage: ${formatRows(stats.stageWinRates)}.`,
  ].join("\n");

  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: dataDump },
      ],
      temperature: 0,
    }),
  });

  if (!res.ok) throw new Error(`AI Gateway insight generation failed: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI Gateway returned no insight text");
  return text;
}
