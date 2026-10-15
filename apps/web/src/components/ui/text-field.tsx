import { cn } from "cn";
import { useId, type ComponentProps, type ReactNode } from "react";
import { ErrorFilledIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

interface TextFieldProps extends ComponentProps<typeof Input> {
  label: ReactNode;
  /** Help under the field (prototype `.supporting`). Replaced by `error` while there is one. */
  supporting?: ReactNode;
  error?: string | null;
  /** Something beside the input, such as a show-password button. */
  trailing?: ReactNode;
}

/**
 * M3 filled text field (prototype `.field`): a label, the input and a supporting line that becomes
 * the error message. The input is described by that line, and marked invalid while there's an error.
 */
function TextField({
  label,
  supporting,
  error,
  trailing,
  className,
  id,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const noteId = `${inputId}-note`;
  const note = error ?? supporting;
  return (
    <div data-slot="text-field" className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        <Input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className={trailing ? "pr-14" : undefined}
          {...props}
        />
        {trailing ? (
          <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span>
        ) : null}
      </div>
      {note ? (
        <p
          id={noteId}
          className={cn(
            "flex items-start gap-1 px-4 text-xs",
            error ? "text-error" : "text-on-surface-variant",
          )}
        >
          {error ? <ErrorFilledIcon aria-hidden className="mt-px size-4 shrink-0" /> : null}
          {note}
        </p>
      ) : null}
    </div>
  );
}

export { TextField };
