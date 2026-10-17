import type { TemplateChoice } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RoleLookup } from "@/features/people-ops/api/people-ops.api";
import { templateSuggestionQuery } from "@/features/people-ops/api/people-ops.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/** A template (published, or a draft they get once it's published), or null: choose later. */
export type TemplatePick = string | null;
const LATER = "later";

const label = (choice: TemplateChoice, suggested: boolean) =>
  `${choice.name}${
    choice.status === "draft"
      ? choice.generating
        ? " (being drafted)"
        : " (draft, waiting for review)"
      : ""
  }${suggested ? " · Suggested" : ""}`;

/**
 * The onboarding template for someone joining (N-18): the template for their role (job title,
 * seniority aside, department and team) is suggested and chosen for them. A draft waiting for
 * review can be chosen too: they get it once it's published. When no template exists for the role
 * it says so; templates are made in Templates (or workspace setup), never from this form. Used by
 * People Ops' New onboarding and the invite form for admins and owners.
 */
export function TemplatePicker({
  id,
  role,
  value,
  onChange,
}: {
  id: string;
  role: RoleLookup;
  value: TemplatePick;
  onChange: (pick: TemplatePick) => void;
}) {
  // Debounce a string: a new object each render would restart the timer for ever.
  const key = JSON.stringify({
    title: role.title.trim(),
    team: role.team ?? null,
    teamId: role.teamId ?? null,
    departmentId: role.departmentId ?? null,
  });
  const debounced = useDebouncedValue(key, 300);
  const lookup = useMemo(() => JSON.parse(debounced) as RoleLookup, [debounced]);
  const suggestion = useQuery(templateSuggestionQuery(lookup));
  // Follow the suggestion until someone picks for themselves.
  const [touched, setTouched] = useState(false);
  const data = suggestion.data;
  const hasTitle = lookup.title.trim().length >= 2;
  useEffect(() => {
    if (touched || !data) return;
    const next = data.suggested?.id ?? null;
    if (next !== value) onChange(next);
  }, [data, touched, value, onChange]);

  const options = [
    ...(data?.options ?? []).map((choice) => ({
      value: choice.id,
      label: label(choice, choice.id === data?.suggested?.id),
    })),
    { value: LATER, label: "Choose later" },
  ];
  const chosen = value ? data?.options.find((entry) => entry.id === value) : undefined;
  const where = data?.department?.name ?? role.team ?? null;
  const hint =
    chosen?.status === "draft"
      ? "This template is still a draft. They get it as soon as it's published."
      : chosen?.fitsBy === "team"
        ? `Suggested for the ${lookup.team ?? "same"} team; there's no template for this role yet.`
        : chosen?.fits
          ? `Suggested for this role${data?.department ? ` in ${data.department.name}` : ""}.`
          : hasTitle && data && !data.suggested
            ? `No template for ${lookup.title.trim()}${where ? ` in ${where}` : ""} yet. Make one in Templates with Generate with AI, then choose it here or on their record.`
            : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        items={Object.fromEntries(options.map((option) => [option.value, option.label]))}
        value={value ?? LATER}
        onValueChange={(next) => {
          setTouched(true);
          onChange(String(next) === LATER ? null : String(next));
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}
