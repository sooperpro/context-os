import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-26 py-4 w-full min-w-0 rounded-md bg-field px-4 text-base text-on-surface shadow-[inset_0_-1px_0_var(--color-on-surface-variant)] transition-shadow duration-[140ms] outline-none placeholder:text-on-surface-variant focus-visible:shadow-[inset_0_-3px_0_var(--color-primary)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-38 aria-invalid:shadow-[inset_0_-3px_0_var(--color-error)]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
