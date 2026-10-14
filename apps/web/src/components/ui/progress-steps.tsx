import { cn } from "cn";
import { CheckIcon } from "@/components/ui/icons";

/**
 * Compact status track (prototype `.c-steps`): equal columns, a 20px dot per step joined by a line,
 * the label underneath. Steps before `current` are done (filled with a check), `current` has a thick
 * ring. For review states such as Draft → Submitted → In review → Published; the numbered wizard
 * stepper is `Stepper`.
 */
function ProgressSteps({
  steps,
  current,
  className,
  ...props
}: Omit<React.ComponentProps<"ol">, "children"> & { steps: readonly string[]; current: number }) {
  return (
    <ol
      data-slot="progress-steps"
      className={cn("grid text-xs text-on-surface-variant", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      {...props}
    >
      {steps.map((step, index) => {
        const done = index < current;
        const isCurrent = index === current;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "relative flex flex-col gap-1",
              isCurrent && "font-semibold text-on-surface",
              // The connector to the next step.
              "after:absolute after:top-2.25 after:right-1 after:left-5.5 after:h-0.5 after:bg-outline-variant after:content-[''] last:after:hidden",
              done && "after:bg-primary",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-5 place-items-center rounded-full bg-pane shadow-[inset_0_0_0_2px_var(--color-outline-variant)] [&_svg]:size-3.5",
                done && "bg-primary text-primary-foreground shadow-none",
                isCurrent && "shadow-[inset_0_0_0_6px_var(--color-primary)]",
              )}
            >
              {done ? <CheckIcon /> : null}
            </span>
            <span>
              {step}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export { ProgressSteps };
