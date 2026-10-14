import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * Segmented option list: radio or checkbox tiles joined by 2px gaps, 16px outer corners,
 * 4px inner corners. A checked tile fills with the secondary container.
 * Compose: <OptionList> {items.map(i => <OptionTile input={<input type="radio" .../>}>...</OptionTile>)} </OptionList>
 */
function OptionList({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      role="group"
      data-slot="option-list"
      data-orientation={orientation}
      className={cn(
        "flex gap-0.5",
        orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        className,
      )}
      {...props}
    />
  );
}

interface OptionTileProps extends Omit<React.ComponentProps<"label">, "children" | "title"> {
  /** The native <input type="radio"|"checkbox">. Kept native so forms and keyboards work unchanged. */
  input: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}

function OptionTile({ className, input, title, description, trailing, ...props }: OptionTileProps) {
  return (
    <label
      data-slot="option-tile"
      className={cn(
        "flex min-h-16 cursor-pointer items-center gap-3 rounded-xs bg-field px-4 py-3 transition-colors first:rounded-t-lg last:rounded-b-lg has-checked:bg-secondary-container has-checked:text-on-secondary-container has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-38 [&_input]:size-5 [&_input]:shrink-0 [&_input]:accent-primary",
        className,
      )}
      {...props}
    >
      {input}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {description ? <span className="text-xs opacity-80">{description}</span> : null}
      </span>
      {trailing}
    </label>
  );
}

export { OptionList, OptionTile };
