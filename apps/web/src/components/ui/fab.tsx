import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Floating action button. 56px, 16px corners morphing to 12px on press, AI container by default
 * (the FAB is "Ask Context Bot"). `extended` shows a label next to the icon. `floating` adds elevation.
 */
const fabVariants = cva(
  "inline-flex h-14 min-w-14 shrink-0 items-center justify-center gap-3 rounded-lg px-4 text-base font-medium whitespace-nowrap transition-[border-radius,box-shadow] duration-[350ms] ease-spring-fast-spatial outline-none select-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50 active:rounded-md disabled:pointer-events-none disabled:opacity-38 [&_svg]:size-6 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        ai: "bg-ai-container text-on-ai-container",
        primary: "bg-primary-container text-on-primary-container",
        secondary: "bg-secondary-container text-on-secondary-container",
      },
      floating: {
        true: "shadow-elevation-3 hover:shadow-elevation-4",
        false: "",
      },
    },
    defaultVariants: { variant: "ai", floating: false },
  },
);

function Fab({
  className,
  variant = "ai",
  floating = false,
  render,
  ...props
}: useRender.ComponentProps<"button"> & VariantProps<typeof fabVariants>) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      { type: "button", className: cn(fabVariants({ variant, floating }), className) },
      props,
    ),
    render,
    state: { slot: "fab", variant },
  });
}

export { Fab, fabVariants };
