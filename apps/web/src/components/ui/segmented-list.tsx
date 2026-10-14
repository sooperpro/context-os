import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

/**
 * Expressive segmented list: items are separate tiles joined by a 2px gap; outer corners 20px,
 * inner corners 4px. An item renders as <div> by default; pass `render={<a />}` or
 * `render={<button />}` for interactive rows (they get the hover state layer).
 * Slots: SegmentedItemLead (40px tonal square), SegmentedItemBody, SegmentedItemTitle,
 * SegmentedItemMeta, SegmentedItemTrail.
 */
function SegmentedList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="segmented-list" className={cn("flex flex-col gap-0.5", className)} {...props} />
  );
}

function SegmentedItem({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { interactive?: boolean }) {
  const { interactive, ...rest } = props;
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex min-h-18 w-full items-center gap-4 rounded-xs bg-pane px-4 py-3 text-start text-inherit no-underline first:rounded-t-xl last:rounded-b-xl",
          (interactive === true || render !== undefined) &&
            "cursor-pointer transition-colors outline-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        ),
      },
      rest,
    ),
    render,
    state: { slot: "segmented-item" },
  });
}

const LEAD_TONES = {
  secondary: "bg-secondary-container text-on-secondary-container",
  primary: "bg-primary-container text-on-primary-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
  success: "bg-success-container text-on-success-container",
  ai: "bg-ai-container text-on-ai-container",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
} as const;

/** Leading tile. `tone` follows the prototype's lead-* classes; `sm` is the 32px compact tile. */
function SegmentedItemLead({
  className,
  tone = "secondary",
  size = "default",
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof LEAD_TONES; size?: "default" | "sm" }) {
  return (
    <span
      data-slot="segmented-item-lead"
      data-tone={tone}
      className={cn(
        "grid shrink-0 place-items-center",
        size === "sm"
          ? "size-8 rounded-[10px] [&_svg]:size-4"
          : "size-10 rounded-md [&_svg]:size-5",
        LEAD_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

function SegmentedItemBody({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="segmented-item-body"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

function SegmentedItemTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="segmented-item-title"
      className={cn("truncate text-sm font-medium text-on-surface", className)}
      {...props}
    />
  );
}

function SegmentedItemMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="segmented-item-meta"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedItemTrail({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="segmented-item-trail"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  SegmentedList,
  SegmentedItem,
  SegmentedItemLead,
  SegmentedItemBody,
  SegmentedItemTitle,
  SegmentedItemMeta,
  SegmentedItemTrail,
};
