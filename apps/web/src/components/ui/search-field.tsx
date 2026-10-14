import { cn } from "cn";
import { useId } from "react";
import { SearchIcon } from "@/components/ui/icons";

/**
 * Page search (prototype `.search`): a pill with the search icon, inside a `role="search"` form that
 * never submits; results update as the user types. `tone="card"` sits on the page background
 * (People, Onboarding), `field` is the filled field (Knowledge Hub).
 */
function SearchField({
  label,
  value,
  onValueChange,
  placeholder,
  tone = "card",
  className,
}: {
  /** The field's accessible name: "Search people". */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  tone?: "card" | "field";
  className?: string;
}) {
  const id = useId();
  return (
    <form role="search" onSubmit={(event) => event.preventDefault()} className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span
        className={cn(
          "flex items-center gap-3 rounded-full px-4 text-on-surface-variant",
          tone === "card"
            ? "h-13 bg-card focus-within:ring-2 focus-within:ring-primary"
            : "h-14 bg-field focus-within:ring-3 focus-within:ring-ring/50",
        )}
      >
        <SearchIcon className={cn("shrink-0", tone === "card" ? "size-6" : "size-5")} aria-hidden />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-on-surface outline-none placeholder:text-on-surface-variant"
        />
      </span>
    </form>
  );
}

export { SearchField };
