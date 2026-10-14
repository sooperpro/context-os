import { cn } from "cn";
import { LEVELS } from "@/features/people-ops/people-ops-meta";

/**
 * A rating on the four-step readiness scale (prototype `.level-scale`): segments filled up to the
 * rating, the chosen level labeled.
 */
export function LevelScale({ area, level }: { area: string; level: number }) {
  return (
    <span role="img" aria-label={`${area}: ${LEVELS[level] ?? ""}`} className="inline-flex gap-0.5">
      {LEVELS.map((label, index) => (
        <span
          key={label}
          className={cn(
            "inline-grid h-6 min-w-7 place-items-center rounded-[4px] bg-surface-container-highest px-2 text-[11px] font-medium tracking-[0.4px] first:rounded-l-xl last:rounded-r-xl",
            index <= level && "bg-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-pane))]",
            index === level && "bg-primary text-primary-foreground",
          )}
        >
          {index === level ? label : null}
        </span>
      ))}
    </span>
  );
}
