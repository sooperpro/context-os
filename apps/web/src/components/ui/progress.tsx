import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * M3 Expressive linear progress. The active indicator is a wave (flat when `flat` or when motion is
 * reduced); the track is a thin line separated by a 4px gap with a stop dot at the end.
 * Tones: primary (default), success, warning, error, ai.
 */
const progressVariants = cva("flex w-full flex-wrap gap-3", {
  variants: {
    tone: {
      primary: "[--progress-active:var(--color-primary)] [--progress-track:var(--color-secondary-container)]",
      success: "[--progress-active:var(--color-success)] [--progress-track:var(--color-success-container)]",
      warning: "[--progress-active:var(--color-warning)] [--progress-track:var(--color-warning-container)]",
      error: "[--progress-active:var(--color-error)] [--progress-track:var(--color-error-container)]",
      ai: "[--progress-active:var(--color-ai)] [--progress-track:var(--color-ai-container)]",
    },
  },
  defaultVariants: { tone: "primary" },
});

interface ProgressProps extends ProgressPrimitive.Root.Props, VariantProps<typeof progressVariants> {
  /** Straight indicator instead of the wave (tables, dense lists). */
  flat?: boolean;
}

function Progress({ className, children, value, tone = "primary", flat = false, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      data-flat={flat || undefined}
      className={cn(progressVariants({ tone }), className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator className={flat ? "" : "progress-wave"} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-3 w-full items-center gap-1 after:h-1 after:flex-1 after:rounded-full after:bg-(--progress-track) after:content-['']",
        // Stop dot at the end of the track.
        "before:absolute before:right-0 before:size-1 before:rounded-full before:bg-(--progress-active) before:content-['']",
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  );
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(
        "h-1 shrink-0 rounded-full bg-(--progress-active) transition-[width] duration-[410ms] ease-spring-default-spatial",
        className,
      )}
      {...props}
    />
  );
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn("ml-auto text-sm text-muted-foreground tabular-nums", className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue, progressVariants };
