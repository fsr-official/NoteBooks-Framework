import { describe, expect, it } from "vitest";
import { COLOR_TOKENS } from "@/lib/theme-tokens";

function luminance(color: string): number {
  const channels = color.match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Expected a hex color, received ${color}`);
  const linear = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(left: string, right: string): number {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mixSrgb(left: string, right: string, leftWeight = 0.5): string {
  const leftChannels = left.match(/[\da-f]{2}/gi);
  const rightChannels = right.match(/[\da-f]{2}/gi);
  if (!leftChannels || !rightChannels) throw new Error("Reader theme colors must use hex notation");
  return `#${leftChannels.map((channel, index) => {
    const mixed = Number.parseInt(channel, 16) * leftWeight
      + Number.parseInt(rightChannels[index], 16) * (1 - leftWeight);
    return Math.round(mixed).toString(16).padStart(2, "0");
  }).join("")}`;
}

describe("reader theme contrast", () => {
  it("keeps body text and all four bracket tones readable in every preset and mode", () => {
    for (const [preset, modes] of Object.entries(COLOR_TOKENS)) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = modes[mode];
        expect(contrastRatio(tokens.text, tokens.background), `${preset} ${mode} body`).toBeGreaterThanOrEqual(4.5);
        const tones = [
          mixSrgb(tokens.accent, tokens.text),
          mixSrgb(tokens.partner, tokens.text),
          mixSrgb(tokens.main, tokens.text),
        ];
        tones.push(mixSrgb(tones[1], tones[2]));
        for (const tone of tones) {
          expect(
            contrastRatio(tone, tokens.background),
            `${preset} ${mode} bracket ${tone}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
