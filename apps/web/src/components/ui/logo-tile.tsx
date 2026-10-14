import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Brand logo tile for connectors. Stays white in both themes (brand marks are designed for it);
 * the logo fills 62% of the tile. Pass the brand SVG or <img> as children.
 */
const logoTileVariants = cva(
  "grid shrink-0 place-items-center overflow-hidden rounded-md bg-logo-tile shadow-[inset_0_0_0_1px_var(--color-outline-variant)] [&>*]:size-[62%] [&>*]:object-contain",
  {
    variants: {
      size: {
        sm: "size-8",
        default: "size-10",
        lg: "size-14",
      },
    },
    defaultVariants: { size: "default" },
  },
);

function LogoTile({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof logoTileVariants>) {
  return (
    <span
      data-slot="logo-tile"
      className={cn(logoTileVariants({ size }), "[color-scheme:light]", className)}
      {...props}
    />
  );
}

/** Overlapping row of logo tiles. */
function LogoStack({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="logo-stack"
      className={cn("flex *:data-[slot=logo-tile]:ring-2 *:data-[slot=logo-tile]:ring-card [&>*+*]:-ml-2", className)}
      {...props}
    />
  );
}

export { LogoTile, LogoStack, logoTileVariants };
