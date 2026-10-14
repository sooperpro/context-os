import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * M3 status chip. State is never color alone: `icon` is required, and the label is the children.
 * 24px, 8px corners, tonal container per tone. `ai` is reserved for AI-generated content.
 */
const statusChipVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-sm py-0 pr-2.5 pl-1.5 text-xs font-medium tracking-wide whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "bg-success-container text-on-success-container",
        warning: "bg-warning-container text-on-warning-container",
        error: "bg-error-container text-on-error-container",
        info: "bg-info-container text-on-info-container",
        ai: "bg-ai-container text-on-ai-container",
        neutral: "bg-surface-container-highest text-on-surface-variant",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

interface StatusChipProps
  extends Omit<React.ComponentProps<"span">, "children">,
    VariantProps<typeof statusChipVariants> {
  icon: ReactNode;
  children: ReactNode;
}

function StatusChip({ className, tone = "neutral", icon, children, ...props }: StatusChipProps) {
  return (
    <span
      data-slot="status-chip"
      data-tone={tone}
      className={cn(statusChipVariants({ tone }), className)}
      {...props}
    >
      <span aria-hidden className="inline-flex">
        {icon}
      </span>
      {children}
    </span>
  );
}

export { StatusChip, statusChipVariants };
