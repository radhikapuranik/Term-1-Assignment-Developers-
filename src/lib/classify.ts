import { geminiJson } from "./gemini";
import { ClassifyOutputSchema, type ClassifyOutput } from "./validate";
import { postKey, type PostRow } from "./types";

const BATCH = 30;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" },
      relevant: { type: "BOOLEAN" },
      sentiment: { type: "STRING", enum: ["negative", "neutral", "positive"] },
      pain_point: { type: "STRING" },
      seeking_help: { type: "BOOLEAN" },
    },
    required: ["id", "relevant", "sentiment", "pain_point", "seeking_help"],
  },
};

const SYSTEM = `You label public developer-community posts for the product manager of a code review automation tool.
For each post decide:
- relevant: true only if the post is genuinely about code review, CI/CD or build pipelines, noisy or false-positive tooling, developer workflow or productivity, or AI developer tools. False when the keyword appears only in passing.
- sentiment: negative, neutral or positive about the problem or tool being discussed.
- pain_point: a short label of at most 8 words naming the developer's pain, or an empty string if there is none.
- seeking_help: true if the author is asking a question or asking for help.
Use only the text given. Return one object per post and copy each id exactly.`;

/** Classifies posts in batches of about 30. Posts missing from the answer simply stay unclassified. */
export async function classifyBatch(posts: PostRow[]): Promise<Map<string, ClassifyOutput[number]>> {
  const out = new Map<string, ClassifyOutput[number]>();
  const input = posts.map((p) => ({
    id: postKey(p.source, p.post_id),
    source: p.source,
    title: p.title,
    snippet: (p.snippet ?? "").slice(0, 400),
  }));
  const valid = new Set(input.map((i) => i.id));
  const { data } = await geminiJson({
    system: SYSTEM,
    prompt: `Posts:\n${JSON.stringify(input)}`,
    responseSchema: SCHEMA,
    temperature: 0,
    zod: ClassifyOutputSchema,
  });
  for (const r of data) {
    if (!valid.has(r.id)) continue; // unknown ids are dropped
    out.set(r.id, { ...r, pain_point: r.pain_point.trim().split(/\s+/).slice(0, 8).join(" ") });
  }
  return out;
}

export function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

/** Newest first within most-discussed first. */
export function classificationOrder(posts: PostRow[]): PostRow[] {
  return [...posts].sort(
    (a, b) =>
      (b.comments ?? b.answer_count ?? 0) - (a.comments ?? a.answer_count ?? 0) ||
      b.created_at.localeCompare(a.created_at),
  );
}
