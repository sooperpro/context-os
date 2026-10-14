import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Two static, non-interactive chips from the prototype's knowledge pages.
 * - MetaChip (`.meta-chip`): 28px facts on a hero, e.g. "Lead: Priya Nair", "Updated today".
 * - TypeChip (`.type-chip`): 22px kind label on rows and cards, e.g. "Decision", "Project".
 * Both take an optional leading icon; neither carries status (use StatusChip for that).
 */
const metaChipVariants = cva(
  "inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs font-medium tracking-wide whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        /** On tinted surfaces such as heroes (`.meta-chip`). */
        translucent: "bg-surface-container-lowest/55",
        /** On panes and cards, e.g. Context Bot's context row (`.ctx-chip`). */
        filled: "bg-surface-container-high pl-2 text-on-surface-variant",
      },
    },
    defaultVariants: { tone: "translucent" },
  },
);

function MetaChip({
  className,
  tone = "translucent",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof metaChipVariants>) {
  return <span data-slot="meta-chip" className={cn(metaChipVariants({ tone }), className)} {...props} />;
}

function TypeChip({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="type-chip"
      className={cn(
        "inline-flex h-5.5 items-center gap-1 rounded-xs bg-surface-container-high px-2 text-[11px] font-medium tracking-wider whitespace-nowrap text-on-surface-variant [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { MetaChip, TypeChip };
