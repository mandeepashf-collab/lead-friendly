/**
 * Stage tone mapping. App-code only for v1 (no DB migration).
 * If user-customized stages diverge significantly from these patterns,
 * revisit with a pipeline_stages.tone column migration.
 *
 * Default fallback is "warm" — keeps the board visually alive even when
 * a stage name doesn't match any pattern.
 */

export type StageTone = "hot" | "warm" | "cold" | "won" | "lost" | "new";

const STAGE_TONE_PATTERNS: Array<{ pattern: RegExp; tone: StageTone }> = [
  { pattern: /^(closed.?won|won|paid|signed|completed|deal.?closed)$/i, tone: "won" },
  { pattern: /^(closed.?lost|lost|rejected|declined|cancelled|canceled|dead)$/i, tone: "lost" },
  { pattern: /^(negotiation|negotiating|contract|proposal.?sent|sent|hot|ready.?to.?close)$/i, tone: "hot" },
  { pattern: /^(proposal|quote|interested|warm|considering)$/i, tone: "warm" },
  { pattern: /^(qualified|no.?contact|cold|prospect|untouched|backlog)$/i, tone: "cold" },
  { pattern: /^(lead|new|inbox|incoming|new.?lead)$/i, tone: "new" },
];

export function getStageTone(stageName: string): StageTone {
  const trimmed = stageName.trim();
  for (const { pattern, tone } of STAGE_TONE_PATTERNS) {
    if (pattern.test(trimmed)) return tone;
  }
  return "warm";
}

/**
 * Tailwind class mappings for each tone. Uses CSS variables shipped in 3.6.1.
 * - bg: subtle tinted background (12% alpha)
 * - border: more visible border (25% alpha)
 * - dot: solid color for indicator dots
 * - text: solid color for label text
 */
export const TONE_CLASSES: Record<StageTone, {
  bg: string;
  border: string;
  dot: string;
  text: string;
  ring: string;
}> = {
  hot:  { bg: "bg-[var(--hot-bg)]",  border: "border-[var(--hot-border)]",  dot: "bg-[var(--hot)]",  text: "text-[var(--hot)]",  ring: "ring-[var(--hot)]"  },
  warm: { bg: "bg-[var(--warm-bg)]", border: "border-[var(--warm-border)]", dot: "bg-[var(--warm)]", text: "text-[var(--warm)]", ring: "ring-[var(--warm)]" },
  cold: { bg: "bg-[var(--cold-bg)]", border: "border-[var(--cold-border)]", dot: "bg-[var(--cold)]", text: "text-[var(--cold)]", ring: "ring-[var(--cold)]" },
  won:  { bg: "bg-[var(--won-bg)]",  border: "border-[var(--won-border)]",  dot: "bg-[var(--won)]",  text: "text-[var(--won)]",  ring: "ring-[var(--won)]"  },
  lost: { bg: "bg-[var(--lost-bg)]", border: "border-[var(--lost-border)]", dot: "bg-[var(--lost)]", text: "text-[var(--lost)]", ring: "ring-[var(--lost)]" },
  new:  { bg: "bg-[var(--new-bg)]",  border: "border-[var(--new-border)]",  dot: "bg-[var(--new)]",  text: "text-[var(--new)]",  ring: "ring-[var(--new)]"  },
};
