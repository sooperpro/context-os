import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * M3 chip. 32px, 8px corners, outlined by default.
 * - assist: an action in context ("View roadmap")
 * - filter: toggles; pass `selected` and it renders aria-pressed with the tonal fill
 * - suggestion: a question or prompt the user can send
 * - ai: a suggestion from Context Bot (teal outline and icon, reserved for AI)
 * - prompt: multi-line suggestion that wraps
 */
const chipVariants = cva(
  "group/chip inline-flex h-8 shrink-0 items-center gap-2 rounded-sm px-4 text-sm font-medium whitespace-nowrap text-on-surface-variant shadow-[inset_0_0_0_1px_var(--color-outline-variant)] transition-[border-radius,background-color] duration-[140ms] outline-none select-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-on-surface/10 disabled:pointer-events-none disabled:opacity-38 aria-pressed:bg-secondary-container aria-pressed:text-on-secondary-container aria-pressed:shadow-none [&_svg]:pointer-events-none [&_svg]:-ml-2 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        assist: "",
        filter: "",
        suggestion: "bg-pane",
        ai: "bg-pane text-on-surface shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ai)_35%,transparent)] [&_svg]:text-ai",
        prompt:
          "h-auto min-h-10 rounded-md px-4 py-2 text-start leading-5 whitespace-normal [&_svg]:ml-0",
      },
    },
    defaultVariants: {
      variant: "assist",
    },
  },
);

interface ChipProps extends useRender.ComponentProps<"button">, VariantProps<typeof chipVariants> {
  /** Filter chips: the selected state. Rendered as aria-pressed. */
  selected?: boolean;
}

function Chip({ className, variant = "assist", selected, render, ...props }: ChipProps) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        type: "button",
        className: cn(chipVariants({ variant }), className),
        ...(variant === "filter" ? { "aria-pressed": selected === true } : {}),
      },
      props,
    ),
    render,
    state: { slot: "chip", variant, selected: selected === true },
  });
}

export { Chip, chipVariants };
