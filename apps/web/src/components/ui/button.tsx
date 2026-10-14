import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * M3 Expressive button. Fully round; the corners tighten on press (fast spatial spring).
 * Hover and press are a currentColor state layer, so every variant reacts the same way.
 *
 * Variants: default (filled primary) · secondary (tonal) · outline · ghost (text) · elevated ·
 * ai · ai-tonal (teal, reserved for Context Bot) · destructive (filled error) · link.
 * Sizes follow the M3 scale: xs 32 · sm 36 · default 40 · md 56 · lg 96, plus icon squares.
 */
const buttonVariants = cva(
  "group/button relative isolate inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition-[border-radius,box-shadow] duration-[350ms] ease-spring-fast-spatial outline-none select-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity before:duration-[140ms] before:content-[''] hover:before:opacity-8 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:before:opacity-10 active:rounded-sm active:before:opacity-10 disabled:pointer-events-none disabled:opacity-38 aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:shadow-elevation-1",
        secondary: "bg-secondary-container text-on-secondary-container",
        outline:
          "bg-transparent text-on-surface-variant shadow-[inset_0_0_0_1px_var(--color-outline-variant)] aria-expanded:bg-secondary-container aria-expanded:text-on-secondary-container",
        ghost:
          "text-primary aria-expanded:bg-secondary-container aria-expanded:text-on-secondary-container",
        elevated:
          "bg-surface-container-low text-primary shadow-elevation-1 hover:shadow-elevation-2",
        ai: "bg-ai text-on-ai hover:shadow-elevation-1",
        "ai-tonal": "bg-ai-container text-on-ai-container",
        destructive:
          "bg-error text-on-error hover:shadow-elevation-1 focus-visible:ring-destructive/30",
        link: "h-auto rounded-none px-0 text-primary underline-offset-4 before:hidden hover:underline active:rounded-none",
      },
      size: {
        xs: "h-8 gap-1 px-3 text-xs active:rounded-sm [&_svg:not([class*='size-'])]:size-4",
        sm: "h-9 gap-1.5 px-3.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        default: "h-10 gap-2 px-4 text-sm [&_svg:not([class*='size-'])]:size-5",
        md: "h-14 gap-2 px-6 text-base active:rounded-md [&_svg:not([class*='size-'])]:size-6",
        lg: "h-24 gap-3 px-12 text-2xl active:rounded-lg [&_svg:not([class*='size-'])]:size-7",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-9 [&_svg:not([class*='size-'])]:size-4.5",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
