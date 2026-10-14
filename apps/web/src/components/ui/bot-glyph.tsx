import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { HubFilledIcon } from "@/components/ui/icons";
import { Shape } from "@/components/ui/shape";

/**
 * Context Bot's mark (prototype `.bot-glyph`): the hub icon on a cookie shape in the AI container.
 * It identifies Context Bot wherever it speaks or is offered. Teal is reserved for this.
 */
const botGlyphVariants = cva("relative grid shrink-0 place-items-center text-on-ai-container", {
  variants: {
    size: {
      xs: "size-7 [&_svg[data-icon]]:size-4",
      sm: "size-9 [&_svg[data-icon]]:size-5",
      default: "size-10 [&_svg[data-icon]]:size-5",
      lg: "size-14 [&_svg[data-icon]]:size-7",
      xl: "size-22 [&_svg[data-icon]]:size-11",
    },
  },
  defaultVariants: { size: "default" },
});

interface BotGlyphProps extends React.ComponentProps<"span">, VariantProps<typeof botGlyphVariants> {
  /** Slowly rotate the shape (welcome state). Off when motion is reduced. */
  spin?: boolean;
}

function BotGlyph({ className, size = "default", spin = false, ...props }: BotGlyphProps) {
  return (
    <span aria-hidden data-slot="bot-glyph" className={cn(botGlyphVariants({ size }), className)} {...props}>
      <Shape
        kind="cookie9"
        className={cn(
          "col-start-1 row-start-1 size-full text-ai-container",
          spin && "motion-safe:animate-[spin_40s_linear_infinite]",
        )}
      />
      <HubFilledIcon data-icon className="relative z-10 col-start-1 row-start-1" />
    </span>
  );
}

export { BotGlyph, botGlyphVariants };
