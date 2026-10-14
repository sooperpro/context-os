import { cn } from "cn";
import { useMemo, type ReactNode } from "react";

/**
 * M3 Expressive circular progress (prototype `.ring`): a wavy active arc from 12 o'clock, a gap,
 * then a flat track. The label sits in the middle. Give it `role="img"` and an `aria-label` that
 * states the value, or hide it when a nearby label already does.
 */
const TONES = {
  primary: "[&_[data-part=active]]:stroke-primary [&_[data-part=track]]:stroke-secondary-container",
  success: "[&_[data-part=active]]:stroke-success [&_[data-part=track]]:stroke-success-container",
  warning: "[&_[data-part=active]]:stroke-warning [&_[data-part=track]]:stroke-warning-container",
  error: "[&_[data-part=active]]:stroke-error [&_[data-part=track]]:stroke-error-container",
} as const;

const TAU = Math.PI * 2;

function ringPaths(size: number, value: number) {
  const stroke = size >= 120 ? 10 : size >= 64 ? 6 : 4;
  const amplitude = size >= 120 ? 2.6 : size >= 64 ? 1.6 : 1;
  const waves = size >= 120 ? 14 : 10;
  const center = size / 2;
  const radius = center - stroke / 2 - amplitude - 1;
  const gap = (stroke + 6) / radius;
  const start = -Math.PI / 2;
  const end = start + value * TAU;
  const arc = (from: number, to: number, wavy: boolean) => {
    const steps = Math.max(2, Math.ceil(((to - from) / TAU) * 360));
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = from + ((to - from) * i) / steps;
      const r = wavy ? radius + amplitude * Math.sin((t - start) * waves) : radius;
      d += `${i ? "L" : "M"}${(center + Math.cos(t) * r).toFixed(2)} ${(center + Math.sin(t) * r).toFixed(2)}`;
    }
    return d;
  };
  if (value >= 0.999) return { stroke, active: arc(start, start + TAU - 0.0001, true), track: "" };
  const hasActive = value > 0.005;
  const trackFrom = hasActive ? end + gap : start;
  const trackTo = start + TAU - (hasActive ? gap : 0.0001);
  return {
    stroke,
    active: hasActive ? arc(start, end, true) : "",
    track: trackTo > trackFrom ? arc(trackFrom, trackTo, false) : "",
  };
}

interface ProgressRingProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** 0..1 */
  value: number;
  /** Diameter in px. */
  size?: number;
  tone?: keyof typeof TONES;
  children?: ReactNode;
}

function ProgressRing({
  value,
  size = 136,
  tone = "primary",
  className,
  children,
  style,
  ...props
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const { stroke, active, track } = useMemo(() => ringPaths(size, clamped), [size, clamped]);
  return (
    <div
      data-slot="progress-ring"
      className={cn("relative inline-grid shrink-0 place-items-center", TONES[tone], className)}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 size-full">
        {track ? (
          <path
            data-part="track"
            d={track}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ) : null}
        {active ? (
          <path
            data-part="active"
            d={active}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      {children ? (
        <div className="relative flex flex-col items-center text-center">{children}</div>
      ) : null}
    </div>
  );
}

export { ProgressRing };
