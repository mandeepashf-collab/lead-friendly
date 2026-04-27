// src/components/dashboard/sparkline.tsx
//
// Inline 7-day sparkline. Pure SVG. No animation.
// - viewBox 0 0 100 28
// - <2 points: renders a flat baseline so layout doesn't shift
// - color is a CSS color string (typically a `var(--...)` from globals.css)

export interface SparklineProps {
  points: number[]
  color: string
  /** Optional className for the wrapping <svg>. Default: "w-full h-7 block". */
  className?: string
}

export function Sparkline({ points, color, className }: SparklineProps) {
  const cls = className ?? "w-full h-7 block"

  if (points.length < 2) {
    return (
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={cls} aria-hidden="true">
        <line x1="0" y1="26" x2="100" y2="26" stroke={color} strokeWidth="1" opacity="0.3" />
      </svg>
    )
  }

  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const coords = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = 26 - ((v - min) / range) * 22
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={cls} aria-hidden="true">
      <polyline
        fill={color}
        opacity="0.10"
        stroke="none"
        points={`${coords} 100,28 0,28`}
      />
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={coords} />
    </svg>
  )
}
