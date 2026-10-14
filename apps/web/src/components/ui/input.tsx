import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

/** M3 filled text field (prototype `.field input`): 56px, field surface, bottom indicator that thickens on focus. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-14 w-full min-w-0 rounded-md bg-field px-4 text-base text-on-surface shadow-[inset_0_-1px_0_var(--color-on-surface-variant)] transition-shadow duration-[140ms] outline-none placeholder:text-on-surface-variant focus-visible:shadow-[inset_0_-3px_0_var(--color-primary)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-38 aria-invalid:shadow-[inset_0_-3px_0_var(--color-error)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
