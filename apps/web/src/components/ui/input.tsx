import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

/**
 * M3 filled text field (prototype `.field input`): 56px, field surface, bottom indicator that
 * thickens on focus. `compact` is 48px, for short forms such as sign-in.
 */
function Input({
  className,
  type,
  inputSize = "default",
  ...props
}: React.ComponentProps<"input"> & { inputSize?: "default" | "compact" }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={inputSize}
      className={cn(
        inputSize === "compact" ? "h-12" : "h-14",
        "w-full min-w-0 rounded-md bg-field px-4 text-base text-on-surface shadow-[inset_0_-1px_0_var(--color-on-surface-variant)] transition-shadow duration-[140ms] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-on-surface-variant focus-visible:shadow-[inset_0_-3px_0_var(--color-primary)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-38 aria-invalid:shadow-[inset_0_-3px_0_var(--color-error)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
