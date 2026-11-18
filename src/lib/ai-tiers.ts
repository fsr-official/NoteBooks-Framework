export const AI_TIERS = {
  low: {
    label: "Low",
    description: "Fast, concise answers · up to 512 output tokens",
    models: ["llama-3.1-8b-instant", "openai/gpt-oss-20b"],
    maxInputTokens: 1_500,
    maxOutputTokens: 512,
  },
  medium: {
    label: "Medium",
    description: "Balanced explanations · up to 1,000 output tokens",
    models: ["openai/gpt-oss-20b", "llama-3.1-8b-instant"],
    maxInputTokens: 2_500,
    maxOutputTokens: 1_000,
    reasoningEffort: "low",
  },
  high: {
    label: "High",
    description: "Detailed reasoning · up to 1,500 output tokens",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    maxInputTokens: 4_000,
    maxOutputTokens: 1_500,
  },
  extra: {
    label: "Extra",
    description: "Deepest reasoning · up to 3,000 output tokens",
    models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    maxInputTokens: 3_500,
    maxOutputTokens: 3_000,
    reasoningEffort: "high",
  },
} as const;

export type AiTier = keyof typeof AI_TIERS;

export function isAiTier(value: unknown): value is AiTier {
  return typeof value === "string" && Object.hasOwn(AI_TIERS, value);
}
