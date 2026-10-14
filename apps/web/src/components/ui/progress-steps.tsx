import { cn } from "cn";
import { CheckIcon } from "@/components/ui/icons";

type Step = string | { label: string; detail?: string };

/**
 * Compact status track (prototype `.c-steps`, `.ms-track`): equal columns, a dot per step joined by
 * a line, the label (and an optional detail) underneath. Steps before `current` are done, `current`
 * has a thick ring. `tone="success"` colors done steps green, for milestones. The numbered wizard
 * stepper is `Stepper`.
 */
function ProgressSteps({
  steps,
  current,
  tone = "primary",
  className,
  ...props
}: Omit<React.ComponentProps<"ol">, "children"> & {
  steps: readonly Step[];
  current: number;
  tone?: "primary" | "success";
}) {
  return (
    <ol
      data-slot="progress-steps"
      className={cn("grid text-xs text-on-surface-variant", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      {...props}
    >
      {steps.map((step, index) => {
        const label = typeof step === "string" ? step : step.label;
        const detail = typeof step === "string" ? undefined : step.detail;
        const done = index < current;
        const isCurrent = index === current;
        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "relative flex flex-col gap-1",
              isCurrent && !detail && "font-semibold text-on-surface",
              // The connector to the next step.
              "after:absolute after:top-2.25 after:right-1 after:left-5.5 after:h-0.5 after:bg-outline-variant after:content-[''] last:after:hidden",
              done && (tone === "success" ? "after:bg-success" : "after:bg-primary"),
            )}
          >
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-5 place-items-center rounded-full bg-pane shadow-[inset_0_0_0_2px_var(--color-outline-variant)] [&_svg]:size-3.5",
                done &&
                  (tone === "success"
                    ? "bg-success-container text-on-success-container shadow-none"
                    : "bg-primary text-primary-foreground shadow-none"),
                isCurrent && "shadow-[inset_0_0_0_6px_var(--color-primary)]",
              )}
            >
              {done ? <CheckIcon /> : null}
            </span>
            {detail ? (
              <>
                <b className="text-sm font-medium text-on-surface">{label}</b>
                <span>{detail}</span>
              </>
            ) : (
              <span>{label}</span>
            )}
            {done ? <span className="sr-only">(done)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export { ProgressSteps };
