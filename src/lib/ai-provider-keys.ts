export const AI_PROVIDER_KEY_SLOTS = [
  { slot: "main", environmentVariable: "GROQ_API_KEY_MAIN" },
  { slot: "science", environmentVariable: "GROQ_API_KEY_SCIENCE" },
  { slot: "commerce", environmentVariable: "GROQ_API_KEY_COMMERCE" },
  { slot: "humanities", environmentVariable: "GROQ_API_KEY_HUMANITIES" },
  { slot: "lower-secondary", environmentVariable: "GROQ_API_KEY_LOWER_SECONDARY" },
] as const;

export type AiProviderKeySlot = (typeof AI_PROVIDER_KEY_SLOTS)[number]["slot"];

export function isAiProviderKeySlot(value: unknown): value is AiProviderKeySlot {
  return typeof value === "string"
    && AI_PROVIDER_KEY_SLOTS.some(({ slot }) => slot === value);
}
