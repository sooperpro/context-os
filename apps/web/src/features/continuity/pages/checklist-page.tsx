import type { ContinuityArea, ContinuityChecklist } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  CheckCircleFilledIcon,
  HandshakeIcon,
  InfoIcon,
  PendingIcon,
  RadioButtonUncheckedIcon,
} from "@/components/ui/icons";
import { Loader } from "@/components/ui/loader";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemTitle,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { CONTINUITY_ENDPOINTS as E } from "@/features/continuity/api/continuity.api";
import { checklistQuery, useUpdateChecklist } from "@/features/continuity/api/continuity.queries";
import { membersQuery } from "@/features/members/api/members.queries";
import { OptionalSelect } from "@/features/members/components/optional-select";
import { formatShortDate } from "@/lib/format";

/**
 * A leaver's hand-over checklist (PRD §8.11), linked from the offboarding notification: each
 * responsibility they held and who takes it over. Their manager picks; an admin's pick, or an
 * admin applying the manager's, hands it over.
 */
export function ChecklistPage() {
  const { checklistId = "" } = useParams();
  const query = useQuery(checklistQuery(checklistId));
  if (query.isPending) {
    return (
      <div className="grid min-h-80 place-items-center">
        <Loader label="Loading the hand-over checklist" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-240">
        <SectionCard
          title="This hand-over checklist could not be loaded"
          endpoint={E.checklist.path}
          status={query}
        />
      </div>
    );
  }
  // A saved checklist comes back with a new version: start the picks again from it.
  return <ChecklistView key={query.data.version} checklist={query.data} />;
}

const stateOf = (area: ContinuityArea) =>
  area.status === "unowned"
    ? { label: "Unowned", icon: <RadioButtonUncheckedIcon className="size-5" aria-hidden /> }
    : area.granted
      ? { label: "Handed over", icon: <CheckCircleFilledIcon className="size-5" aria-hidden /> }
      : { label: "Waiting for an admin", icon: <PendingIcon className="size-5" aria-hidden /> };

function ChecklistView({ checklist }: { checklist: ContinuityChecklist }) {
  const members = useQuery(membersQuery());
  const update = useUpdateChecklist(checklist.id);
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    Object.fromEntries(checklist.areas.map((area) => [area.key, area.assignee?.id ?? ""])),
  );
  const people = (members.data ?? [])
    .filter((member) => member.status === "active" && member.id !== checklist.leaver.id)
    .map((member) => ({ value: member.id, label: member.name }));
  const changed = checklist.areas.filter((area) => picks[area.key] !== (area.assignee?.id ?? ""));
  // An admin's save also applies the picks a manager left waiting.
  const waiting = checklist.areas.filter((area) => area.status === "reassigned" && !area.granted);
  const toSave = checklist.canGrant
    ? [...changed, ...waiting.filter((area) => !changed.includes(area))]
    : changed;
  const name = checklist.leaver.name;
  const handedOver = checklist.areas.filter((area) => area.granted).length;

  const save = () =>
    update.mutate(
      {
        version: checklist.version,
        areas: toSave.map((area) =>
          picks[area.key]
            ? { key: area.key, status: "reassigned", assigneeId: picks[area.key] }
            : { key: area.key, status: "unowned" },
        ),
      },
      {
        onSuccess: (next) =>
          toast.success(
            next.status === "completed"
              ? `Everything ${name} owned is handed over`
              : checklist.canGrant
                ? "Hand-over saved"
                : "Your picks are saved. An admin will apply them.",
          ),
        onError: () => toast.error("The checklist could not be saved. Please try again."),
      },
    );

  return (
    <div className="mx-auto flex max-w-240 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-medium text-balance">
            Hand over {name}&apos;s responsibilities
          </h1>
          <Badge variant={checklist.status === "completed" ? "success" : "neutral"}>
            {checklist.status === "completed" ? "Done" : "Open"}
          </Badge>
        </div>
        <p className="text-sm text-on-surface-variant">
          {name} was offboarded on {formatShortDate(checklist.createdAt)}. Pick who takes over each
          thing they owned, or leave it unowned.
        </p>
      </header>

      {checklist.canGrant ? (
        waiting.length ? (
          <Banner
            tone="info"
            icon={<InfoIcon />}
            title={`${waiting.length} ${waiting.length === 1 ? "pick is" : "picks are"} waiting for you`}
            description="Their manager chose new owners. Save to hand the responsibilities over."
          />
        ) : null
      ) : (
        <Banner
          tone="info"
          icon={<InfoIcon />}
          title="An admin applies your picks"
          description="Until then, the responsibilities stay unowned. Admins are notified when you save."
        />
      )}

      <SectionCard
        title="Responsibilities"
        action={
          checklist.areas.length ? (
            <span className="text-xs text-on-surface-variant">
              {handedOver} of {checklist.areas.length} handed over
            </span>
          ) : null
        }
      >
        {checklist.areas.length ? (
          <SegmentedList aria-label="Responsibilities">
            {checklist.areas.map((area) => {
              const state = stateOf(area);
              const id = `owner-${area.key}`;
              return (
                <SegmentedItem key={area.key} className="flex-wrap">
                  <span className={area.granted ? "text-success" : "text-outline"}>
                    {state.icon}
                  </span>
                  <SegmentedItemBody>
                    <SegmentedItemTitle>{area.type}</SegmentedItemTitle>
                    <span className="text-xs text-on-surface-variant">
                      {area.scope} · {state.label}
                    </span>
                  </SegmentedItemBody>
                  <div className="w-full max-w-64 min-w-48">
                    <label htmlFor={id} className="sr-only">
                      New {area.type.toLowerCase()} for {area.scope}
                    </label>
                    <OptionalSelect
                      id={id}
                      value={picks[area.key] ?? ""}
                      options={people}
                      disabled={update.isPending || members.isPending}
                      onChange={(value) =>
                        setPicks((current) => ({ ...current, [area.key]: value }))
                      }
                    />
                  </div>
                </SegmentedItem>
              );
            })}
          </SegmentedList>
        ) : (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <HandshakeIcon className="size-5" aria-hidden /> {name} didn&apos;t own anything that
            needs handing over.
          </p>
        )}
        {checklist.areas.length ? (
          <div className="flex justify-end">
            <Button disabled={!toSave.length || update.isPending} onClick={save}>
              {checklist.canGrant ? "Hand over" : "Save picks"}
            </Button>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
