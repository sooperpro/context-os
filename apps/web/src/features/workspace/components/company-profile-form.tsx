import type { CompanyProfile, CompanyProfileInput } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { WarningIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  companyProfileQuery,
  useSaveCompanyProfile,
} from "@/features/workspace/api/workspace.queries";

const LIMITS = { description: 1000, products: 1000, workingHours: 200 } as const;

/**
 * The company profile (N-7): what the company does, its products and its working hours. Setup's
 * first step and the Workspace page edit it; the AI reads it when it drafts templates and modules.
 */
export function CompanyProfileForm({ onSaved }: { onSaved?: () => void }) {
  const query = useQuery(companyProfileQuery());
  if (query.isPending) return <Skeleton className="h-64 rounded-card" aria-busy="true" />;
  if (query.isError)
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="Could not load the company profile"
        description={query.error.message}
      />
    );
  return <ProfileFields saved={query.data} onSaved={onSaved} />;
}

function ProfileFields({ saved, onSaved }: { saved: CompanyProfile; onSaved?: () => void }) {
  const id = useId();
  const save = useSaveCompanyProfile();
  const [draft, setDraft] = useState<CompanyProfileInput>(saved);
  const set = (key: keyof CompanyProfileInput, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const dirty = (Object.keys(LIMITS) as Array<keyof CompanyProfileInput>).some(
    (key) => draft[key].trim() !== saved[key],
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(
          {
            description: draft.description.trim(),
            products: draft.products.trim(),
            workingHours: draft.workingHours.trim(),
          },
          {
            onSuccess: () => {
              toast.success("Company profile saved");
              onSaved?.();
            },
            onError: (error) => toast.error(error.message),
          },
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-description`}>What the company does</Label>
        <Textarea
          id={`${id}-description`}
          rows={3}
          maxLength={LIMITS.description}
          placeholder="Fleet telematics for logistics companies in the UK and Ireland."
          value={draft.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-products`}>Products and services</Label>
        <Textarea
          id={`${id}-products`}
          rows={3}
          maxLength={LIMITS.products}
          placeholder="Tracker (hardware), Route planner, Fleet insights dashboard."
          value={draft.products}
          onChange={(event) => set("products", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-hours`}>Working hours</Label>
        <Input
          id={`${id}-hours`}
          maxLength={LIMITS.workingHours}
          placeholder="Mon–Fri, 9:00–17:30 UK time, hybrid"
          value={draft.workingHours}
          onChange={(event) => set("workingHours", event.target.value)}
        />
      </div>
      <p className="text-xs text-on-surface-variant">
        The AI reads this when it drafts onboarding templates and modules, to understand the
        company. Facts still come from your documents.
      </p>
      <div>
        <Button type="submit" disabled={!dirty || save.isPending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
