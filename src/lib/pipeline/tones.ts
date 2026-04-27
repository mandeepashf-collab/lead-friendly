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
  { pattern: /^(proposal|quote|qualified|interested|warm|considering)$/i, tone: "warm" },
  { pattern: /^(no.?contact|cold|prospect|untouched|backlog)$/i, tone: "cold" },
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
  hot:  { bg: "bg-[--hot-bg]",  border: "border-[--hot-border]",  dot: "bg-[--hot]",  text: "text-[--hot]",  ring: "ring-[--hot]"  },
  warm: { bg: "bg-[--warm-bg]", border: "border-[--warm-border]", dot: "bg-[--warm]", text: "text-[--warm]", ring: "ring-[--warm]" },
  cold: { bg: "bg-[--cold-bg]", border: "border-[--cold-border]", dot: "bg-[--cold]", text: "text-[--cold]", ring: "ring-[--cold]" },
  won:  { bg: "bg-[--won-bg]",  border: "border-[--won-border]",  dot: "bg-[--won]",  text: "text-[--won]",  ring: "ring-[--won]"  },
  lost: { bg: "bg-[--lost-bg]", border: "border-[--lost-border]", dot: "bg-[--lost]", text: "text-[--lost]", ring: "ring-[--lost]" },
  new:  { bg: "bg-[--new-bg]",  border: "border-[--new-border]",  dot: "bg-[--new]",  text: "text-[--new]",  ring: "ring-[--new]"  },
};
