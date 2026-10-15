import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** "Not set" in an optional select; forms hold "" for it. */
const NONE = "none";

/** A dropdown where leaving the choice empty is allowed. `value` and `onChange` use "" for "Not set". */
export function OptionalSelect({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <Select
      items={{
        [NONE]: "Not set",
        ...Object.fromEntries(options.map((option) => [option.value, option.label])),
      }}
      value={value || NONE}
      disabled={disabled}
      onValueChange={(next) => onChange(next === NONE || next == null ? "" : String(next))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not set</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
